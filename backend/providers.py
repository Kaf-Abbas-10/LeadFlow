from __future__ import annotations

import csv
import io
import re
import socket
import ipaddress
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from .settings import setting


def public_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {'https', 'http'} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Website must be a public http(s) URL without credentials.')
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
    except (OSError, ValueError) as exc:
        raise ValueError('Website hostname could not be resolved.') from exc
    if any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Private and local website addresses are not allowed.')
    return url


def parse_csv(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), strict=True)
    if not reader.fieldnames:
        raise ValueError("The CSV needs a header row.")
    normalized = {header.strip().lower().replace(" ", "_"): header for header in reader.fieldnames if header}

    def value(row: dict[str, str], *aliases: str) -> str:
        for alias in aliases:
            actual = normalized.get(alias)
            if actual and row.get(actual):
                return row[actual].strip()
        return ""

    leads: list[dict[str, str]] = []
    seen = set()
    for row in reader:
        if None in row:
            raise ValueError('CSV row has extra columns. Quote fields containing commas.')
        name = value(row, "company", "company_name", "name", "organization")
        if not name:
            continue
        location = value(row, "location", "city", "state", "address")
        site = value(row, "website", "domain", "url", "website_url")
        if site and not urlparse(site).scheme:
            site = f"https://{site}"
        if site:
            parsed = urlparse(site)
            if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('Invalid website URL in CSV.')
        identity = (name.casefold(), site.casefold().rstrip('/'), location.casefold())
        if identity in seen:
            continue
        seen.add(identity)
        leads.append({"name": name[:250], "location": location[:250], "site": site[:2000]})
        if len(leads) > 25:
            raise ValueError('A run supports at most 25 unique companies. Split this CSV into smaller files.')
    if not leads:
        raise ValueError("No companies found. Add a company/name column and at least one data row.")
    return leads


def apollo_search(target: str, limit: int = 6) -> list[dict[str, str]]:
    api_key = setting("APOLLO_API_KEY")
    if not api_key:
        raise ValueError("Apollo is selected, but APOLLO_API_KEY is empty in .env.")
    match = re.match(r"\s*(.*?)\s+in\s+(.+?)\s*$", target, re.IGNORECASE)
    industry, location = (match.group(1), match.group(2)) if match else (target, "")
    payload: dict[str, Any] = {"per_page": min(max(limit, 1), 25), "page": 1}
    if industry:
        payload["q_organization_keyword_tags"] = [industry]
    if location:
        payload["organization_locations"] = [location]
    response = httpx.post(
        "https://api.apollo.io/api/v1/mixed_companies/search",
        headers={"x-api-key": api_key, "Content-Type": "application/json", "Cache-Control": "no-cache"},
        json=payload,
        timeout=35,
    )
    if response.is_error:
        try:
            body = response.json()
        except ValueError:
            body = {}
        body = body if isinstance(body, dict) else {}
        structured = body.get('error_details')
        structured = structured if isinstance(structured, dict) else {}
        code = str(structured.get('code') or body.get('error_code') or '')[:100]
        message = str(structured.get('message') or body.get('error') or body.get('message') or '')
        message = message.replace(api_key, '[redacted]')[:160]
        detail = f"Apollo HTTP {response.status_code}"
        if code:
            detail += f" ({code.replace(api_key, '[redacted]')})"
        if message:
            detail += f": {message}"
        if response.status_code == 403:
            detail += ". Check Company Search permission on your Apollo API key. If already enabled, ask Apollo support to enable this endpoint for your team. Firecrawl web search is available."
        elif response.status_code == 401:
            detail += '. Check APOLLO_API_KEY and restart the backend after changing it.'
        if response.status_code == 429:
            detail = "Apollo rate limit reached. Wait before trying again."
        raise RuntimeError(detail)
    organizations = response.json().get("organizations", [])
    return [
        {
            "name": org.get("name") or "Unknown company",
            "location": org.get("city") or org.get("state") or org.get("country") or location,
            "site": org.get("website_url") or (f"https://{org['primary_domain']}" if org.get("primary_domain") else ""),
        }
        for org in organizations
        if org.get("name")
    ]


def firecrawl_search(target: str, limit: int = 6) -> list[dict[str, str]]:
    key = setting('FIRECRAWL_API_KEY')
    if not key:
        raise ValueError('Firecrawl web search requires FIRECRAWL_API_KEY in .env.')
    response = httpx.post(
        'https://api.firecrawl.dev/v2/search',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={'query': target + ' official business websites', 'limit': min(max(limit, 1),25),
              'sources': [{'type':'web'}],
              'excludeDomains': ['yelp.com','facebook.com','linkedin.com','youtube.com','yellowpages.com']},
        timeout=65,
    )
    if response.is_error:
        raise RuntimeError(f'Firecrawl web search returned HTTP {response.status_code}. Check the API key, quota, and search access.')
    payload = response.json()
    if payload.get('success') is False:
        raise RuntimeError('Firecrawl could not complete the web search. Check provider status and credits.')
    data = payload.get('data', {})
    results = data if isinstance(data, list) else data.get('web', [])
    leads, seen = [], set()
    for result in results:
        url = result.get('url') or ''
        parsed = urlparse(url)
        if parsed.scheme not in {'http','https'} or not parsed.hostname or parsed.username or parsed.password:
            continue
        domain = parsed.hostname.lower().removeprefix('www.')
        if domain in seen:
            continue
        seen.add(domain)
        leads.append({'name': (result.get('title') or domain)[:250], 'location': 'Not verified', 'site': url})
        if len(leads) >= limit:
            break
    return leads


def scrape_company(url: str) -> str:
    if not url:
        return "No website was supplied. Use only the company name and location as context."
    public_url(url)
    key = setting("FIRECRAWL_API_KEY")
    if key:
        try:
            response = httpx.post(
                "https://api.firecrawl.dev/v2/scrape",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
                timeout=45,
            )
            response.raise_for_status()
            data = response.json().get("data", {})
            content = data.get("markdown") or data.get("summary") or ""
            if content:
                return content[:16000]
        except httpx.HTTPError:
            pass
    try:
        for _ in range(6):
            public_url(url)
            response = httpx.get(url, follow_redirects=False, timeout=18, headers={"User-Agent": "LeadFlowResearchDemo/1.0"})
            if not response.is_redirect:
                break
            from urllib.parse import urljoin
            url = urljoin(url, response.headers.get('location', ''))
        else:
            raise ValueError('Website redirected too many times.')
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()
        return soup.get_text(" ", strip=True)[:12000] or "Website loaded but did not contain readable text."
    except httpx.HTTPError:
        return "The website could not be fetched. Base the result on the company name and location only, and lower confidence."
