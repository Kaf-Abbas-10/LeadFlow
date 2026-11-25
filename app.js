'use strict';
const $ = selector => document.querySelector(selector);
const state = { leads: [], filter: 'review', selected: new Set(), connected: false, loading: true, busy: false, mutating: false, current: null, poll: null, runs: [], initialized: false };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer, returnFocusId;
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),6000); }
function message(selector, text='') { const node=$(selector);node.textContent=text;node.hidden=!text; }
async function request(path, options={}) {
  const response=await fetch(path,options); let data;
  try {data=await response.json();} catch {throw new Error('The server returned an invalid response. Try reconnecting.');}
  if(!response.ok){const detail=data.detail;throw new Error(typeof detail==='string'?detail:Array.isArray(detail)?detail.map(x=>x.msg).join('; '):`Request failed (${response.status}).`);}
  return data;
}
function fitBadge(lead) {const kind=lead.fit==='Good fit'?'good':lead.fit==='Skip'?'skip':'maybe';return `<span class="fit-badge ${kind}">${escapeHtml(lead.fit)}</span><span class="fit-score">${Number(lead.score)}/100</span>`;}
function statusBadge(status) {return `<span class="status-badge ${status==='review'?'pending':''}">${status==='sent'?'Demo sent':status==='approved'?'Approved':'Awaiting review'}</span>`;}
function safeWebsite(value) {try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url:null;}catch{return null;}}
function visibleLeads() {
  const term=$('#search').value.trim().toLowerCase(),fit=$('#fitFilter').value;
  const items=state.leads.filter(l=>(state.filter==='all'||l.status===state.filter)&&(fit==='all'||l.fit===fit)&&`${l.name} ${l.location} ${l.site}`.toLowerCase().includes(term));
  const sort=$('#sortBy').value;
  return items.sort((a,b)=>(sort==='score-asc'?a.score-b.score:sort==='name'?a.name.localeCompare(b.name):sort==='newest'?String(b.created_at).localeCompare(String(a.created_at)):b.score-a.score)||a.name.localeCompare(b.name));
}
function emptyTable() {
  let title='No drafts awaiting review',copy='Your reviewed leads are available in Approved and Demo sent.';
  if(!state.connected){title='Research service unavailable';copy='Start the backend, then reconnect below. Saved records will reappear when the connection is restored.';}
  else if(!state.leads.length){title=state.busy?'Research is in progress':'Find your first companies';copy=state.busy?'New drafts will appear here as research finishes.':'Describe your target and offer above. Each researched draft arrives here for your review.';}
  else if($('#search').value||$('#fitFilter').value!=='all'){title='No matching companies';copy='Try another search or clear your fit filter.';}
  else if(state.filter==='approved'){title='No approved drafts yet';copy='Open a draft in Needs review, check its evidence, and approve it.';}
  else if(state.filter==='sent'){title='No demo sent records';copy='Approved drafts can be marked sent for the demo. No email will be delivered.';}
  return `<tr><td class="empty-cell" colspan="6"><h3>${title}</h3><p>${copy}</p>${state.connected&&!state.leads.length&&!state.busy?'<button class="btn secondary" data-open-research>Describe your target</button>':''}</td></tr>`;
}
function render() {
  const visible=visibleLeads(), focus=document.activeElement?.dataset.select;
  const counts={review:0,approved:0,sent:0};state.leads.forEach(l=>counts[l.status]++);
  $('#leadRows').innerHTML=state.loading?[1,2,3].map(()=>'<tr aria-hidden="true">'+Array.from({length:6},()=>'<td><div class="skeleton"></div></td>').join('')+'</tr>').join(''):visible.length?visible.map(l=>`<tr class="${state.selected.has(l.id)?'selected':''}"><td><input type="checkbox" data-select="${escapeHtml(l.id)}" ${state.selected.has(l.id)?'checked':''} aria-label="Select ${escapeHtml(l.name)}"></td><td><div class="company"><span class="company-avatar" aria-hidden="true">${escapeHtml(l.name[0])}</span><span><strong>${escapeHtml(l.name)}</strong><small>${escapeHtml(l.location||'Location not verified')}</small><small>${escapeHtml(safeWebsite(l.site)?.hostname||'No website provided')}</small></span></div></td><td>${fitBadge(l)}</td><td><div class="research-preview"><p class="clamp">${escapeHtml(l.insight||'No research evidence saved.')}</p><button class="text-button" data-evidence="${escapeHtml(l.id)}" aria-label="Read evidence for ${escapeHtml(l.name)}">Read evidence</button></div></td><td>${statusBadge(l.status)}</td><td><button class="btn secondary draft-button" data-draft="${escapeHtml(l.id)}" aria-label="Review draft for ${escapeHtml(l.name)}">Review draft <span aria-hidden="true">→</span></button></td></tr>`).join(''):emptyTable();
  for(const [id,value] of Object.entries({mTotal:state.leads.length,mReview:counts.review,mApproved:counts.approved,countAll:state.leads.length,countReview:counts.review,countApproved:counts.approved,countSent:counts.sent}))$('#'+id).textContent=state.loading?'—':value;
  $('#nextAction').textContent=state.loading?'Loading your research workspace…':counts.review?`${counts.review} draft${counts.review===1?' needs':'s need'} your review. Check the evidence before approving.`:state.leads.length?'Your review queue is clear. Find more companies or revisit approved drafts.':'Start with a target and your offer. We’ll research companies and draft introductions.';
  $('#reviewPrompt').textContent=state.leads.length?'Open review queue →':'Start with a target →';
  $('#selectAll').checked=visible.length>0&&visible.every(l=>state.selected.has(l.id));$('#selectAll').indeterminate=visible.some(l=>state.selected.has(l.id))&&!$('#selectAll').checked;$('#selectAll').disabled=!visible.length;
  $('#runBtn').disabled=!state.connected||state.busy||state.loading;$('#runBtn').textContent=state.busy?'Researching…':'Find leads →';
  for(const selector of ['#source','#leadLimit','#csvFile','#target','#offer'])$(selector).disabled=state.busy;
  const selected=state.leads.filter(l=>state.selected.has(l.id)), pending=selected.filter(l=>l.status==='review').length,approved=selected.filter(l=>l.status==='approved').length;
  $('#bulkBar').hidden=!selected.length;$('#selectionCount').textContent=`${selected.length} selected`;
  $('#bulkHint').hidden=!selected.length&&state.filter==='review';
  $('#approveAll').hidden=!pending;$('#sendDemo').hidden=!approved;
  $('#approveAll').textContent=`Approve ${pending} draft${pending===1?'':'s'}`;$('#sendDemo').textContent=`Mark ${approved} sent · demo`;
  $('#approveAll').disabled=!state.connected||state.mutating||!pending;$('#sendDemo').disabled=!state.connected||state.mutating||!approved;
  $('#bulkHint').textContent=selected.length?`${pending} awaiting review · ${approved} approved. Approval never sends an email. Demo sending only updates status.`:state.filter==='approved'?'Select an approved draft to mark it sent for the demo. No email will be delivered.':state.filter==='sent'?'Demo sent records are read only. No email has been delivered.':'Select drafts awaiting review to approve them. Nothing is sent.';
  $('#exportBtn').disabled=!state.leads.length||state.loading;
  $('#tableCount').textContent=state.loading?'Loading saved leads…':`${visible.length} shown · ${state.leads.length} loaded records${state.leads.length===1000?' (latest 1,000)':''}`;
  $('.tablewrap').setAttribute('aria-busy',String(state.loading));
  if(focus)document.querySelector(`[data-select="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
}
async function refresh() {
  state.leads=await request('/api/leads?limit=1000');const visibleIds=new Set(visibleLeads().map(l=>l.id));state.selected=new Set([...state.selected].filter(id=>visibleIds.has(id)));state.loading=false;render();
}
function activity(run) {
  if(!run)return;$('#runProgress').hidden=run.status==='completed';
  const active=['running','queued'].includes(run.status);$('#runSpinner').hidden=!active;
  $('#runTitle').textContent=run.status==='queued'?'Research queued':active?(run.total?'Researching companies':'Finding company websites'):run.status==='partial'?'Research finished with some errors':run.status==='failed'?'Research could not finish':run.total?'Research complete':'No companies found';
  $('#runDetail').textContent=`${run.target}${run.total?` · ${run.processed} of ${run.total} processed`:''}`;
  $('#runState').textContent=run.status==='partial'?'Partial result':run.status==='completed'?'Complete':run.status==='failed'?'Needs attention':'In progress';
  message('#runError',run.error||'');
}
async function loadRuns() {
  state.runs=await request('/api/runs');$('#runHistory').innerHTML=state.runs.length?state.runs.map(r=>`<div class="history-item"><div><strong>${escapeHtml(r.target)}</strong><p>${escapeHtml(r.source)} · ${new Date(r.created_at).toLocaleString()} · ${r.processed}/${r.total} processed</p>${r.error?`<p class="inline-error">${escapeHtml(r.error)}</p>`:''}</div><span class="status-badge">${escapeHtml(r.status)}</span></div>`).join(''):'<div class="history-item"><p>No research runs yet. Start a search above to see progress and results here.</p></div>';return state.runs;
}
function disconnected(text) {
  state.connected=false;state.loading=false;state.busy=false;clearTimeout(state.poll);
  $('#connection').textContent='Backend unavailable';$('#modeBadge').textContent='OFFLINE';
  $('#connectionError').replaceChildren(document.createTextNode(text+' '));const retry=document.createElement('button');retry.className='text-button';retry.textContent='Reconnect';retry.onclick=connect;$('#connectionError').append(retry);$('#connectionError').hidden=false;render();
}
function watch(id) {
  clearTimeout(state.poll);state.busy=true;render();
  async function tick(){try {const run=await request('/api/runs/'+encodeURIComponent(id));activity(run);await refresh();if(['completed','failed','partial'].includes(run.status)){state.busy=false;await loadRuns();render();if(run.status==='completed'&&run.total){$('#researchSetup').open=false;toast('Research complete. Review each draft before approving.');}else if(!run.total&&run.status==='completed')message('#runError','No companies found. Try a broader target or a nearby location.');return;}state.poll=setTimeout(tick,1500);}catch(error){disconnected('Connection lost. Saved leads are retained. Reconnect to restore run progress.');}}
  tick();
}
async function connect() {
  try {$('#reconnect').disabled=true;const health=await request('/api/health'),schedule=await request('/api/schedule');
    state.connected=true;$('#connection').textContent='Connected · local workspace';$('#modeBadge').textContent='Connected';message('#connectionError');
    if(!state.initialized){$('#source').value=['apollo','firecrawl','csv'].includes(health.integrations.lead_source)?health.integrations.lead_source:'firecrawl';sourceControls();}
    $('#providerStatus').textContent=health.integrations.gemini?'AI drafting configured · '+(health.integrations.firecrawl?'Web research configured':'Basic website fetching'):'Gemini key missing. Add it to .env and restart the backend.';
    $('#scheduleStatus').textContent=schedule.enabled?`Daily research · ${String(schedule.hour).padStart(2,'0')}:00 ${schedule.timezone}`:'Daily schedule is off';
    await refresh();if(!state.initialized&&state.leads.length)$('#researchSetup').open=false;state.initialized=true;
    const runs=await loadRuns();activity(runs[0]);const active=runs.find(r=>['queued','running'].includes(r.status));if(active)watch(active.id);
  }catch(error){disconnected('Could not connect to the backend. Start the server and try again.');}finally{$('#reconnect').disabled=false;}
}
$('#researchForm').onsubmit=async event=>{
  event.preventDefault();if(state.busy||!state.connected)return;
  const target=$('#target').value.trim(),offer=$('#offer').value.trim(),source=$('#source').value;message('#formError');
  if(target.length<3){message('#formError','Describe your target in at least three characters.');$('#target').focus();return;}
  if(source==='csv'&&!$('#csvFile').files[0]){message('#formError','Choose a CSV file before starting research.');$('#csvFile').focus();return;}
  state.busy=true;render();message('#runError');
  try {let result;if(source==='csv'){const data=new FormData();data.append('file',$('#csvFile').files[0]);result=await request('/api/runs/csv?'+new URLSearchParams({target,offer}),{method:'POST',body:data});}else result=await request('/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,offer,source,limit:Number($('#leadLimit').value)})});filter('review');watch(result.id);}catch(error){state.busy=false;render();message('#formError',error.message);}
};
function openResearch(){$('#researchSetup').open=true;$('#target').focus();$('#researchSetup').scrollIntoView({behavior:'smooth',block:'start'});}
function filter(value){state.filter=value;state.selected.clear();document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});render();}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>filter(b.dataset.filter));
$('#reviewShortcut').onclick=()=>{if(!state.leads.length)openResearch();else{filter('review');$('#leads').scrollIntoView({behavior:'smooth'});$('[data-filter="review"]').focus({preventScroll:true});}};
$('#search').oninput=()=>{state.selected.clear();render();};$('#fitFilter').onchange=()=>{state.selected.clear();render();};$('#sortBy').onchange=render;
$('#leadRows').onchange=event=>{const id=event.target.dataset.select;if(!id)return;event.target.checked?state.selected.add(id):state.selected.delete(id);render();};
$('#selectAll').onchange=event=>{const checked=event.target.checked;visibleLeads().forEach(l=>checked?state.selected.add(l.id):state.selected.delete(l.id));render();};
$('#clearSelection').onclick=()=>{state.selected.clear();render();$('#selectAll').focus();};
function openDrawer(id,evidence=false) {
  const lead=state.leads.find(l=>l.id===id);if(!lead)return;state.current=id;returnFocusId=id;
  $('#modalTitle').textContent=lead.name;$('#modalContext').textContent=lead.insight||'No research evidence was saved for this company.';
  $('#drawerBadges').innerHTML=`<span>${fitBadge(lead)}</span>${statusBadge(lead.status)}`;
  const url=safeWebsite(lead.site);$('#sourceLink').hidden=!url;if(url){$('#sourceLink').href=url.href;$('#sourceLink').textContent=`Visit ${url.hostname} ↗`;$('#sourceLink').setAttribute('aria-label',`Visit ${url.hostname} (opens in a new tab)`);}
  $('#draftText').value=lead.draft||'';$('#draftText').disabled=lead.status==='sent'||!state.connected;
  $('#saveDraft').disabled=lead.status==='sent'||!state.connected;$('#modalApprove').disabled=lead.status!=='review'||!lead.draft?.trim()||!state.connected;
  $('#modalApprove').textContent=lead.status==='approved'?'Draft approved':'Approve draft';
  $('#modalStatus').textContent=lead.status==='sent'?'Demo sent record · read only. No email was delivered.':lead.status==='approved'?'Saving an edited draft returns it to review.':'Read the research, check the message, and approve when it’s ready.';
  $('#draftCount').textContent=`${lead.draft?.length||0}/4000`;message('#drawerError');$('#modalbg').showModal();
  if(evidence)$('#evidenceTitle').focus();else $('#draftText').disabled?$('#closeModal').focus():$('#draftText').focus();
}
function closeDrawer(){$('#modalbg').close();const button=document.querySelector(`[data-draft="${CSS.escape(returnFocusId||'')}"]`);(button||$(`[data-filter="${state.filter}"]`)).focus({preventScroll:true});state.current=null;}
$('#leadRows').onclick=event=>{const button=event.target.closest('[data-draft],[data-evidence],[data-open-research]');if(!button)return;if(button.hasAttribute('data-open-research'))openResearch();else openDrawer(button.dataset.draft||button.dataset.evidence,!!button.dataset.evidence);};
$('#closeModal').onclick=closeDrawer;$('#modalbg').addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});
document.addEventListener('keydown',event=>{if(event.key!=='Tab'||!$('#modalbg').open)return;const controls=[...$('#modalbg').querySelectorAll('a[href],button:not(:disabled),textarea:not(:disabled)')].filter(el=>el.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
$('#modalbg').onclick=event=>{if(event.target!==$('#modalbg'))return;const box=$('#modalbg').getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right)closeDrawer();};
$('#draftText').oninput=()=>{const lead=state.leads.find(l=>l.id===state.current),edited=$('#draftText').value!==lead?.draft;$('#draftCount').textContent=`${$('#draftText').value.length}/4000`;$('#modalApprove').disabled=!state.connected||state.mutating||lead?.status==='sent'||!$('#draftText').value.trim()||lead?.status==='approved';if(lead?.status==='approved'&&edited)$('#modalStatus').textContent='Save changes to return this draft to review, then approve the updated message.';};
async function update(id,body){return request('/api/leads/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function editDraft(approve){if(state.mutating)return;state.mutating=true;$('#saveDraft').disabled=true;$('#modalApprove').disabled=true;message('#drawerError');try {await update(state.current,{draft:$('#draftText').value,...(approve?{status:'approved'}:{})});await refresh();closeDrawer();toast(approve?'Draft approved. No email sent.':'Changes saved. Edited approvals return to review.');}catch(error){message('#drawerError',error.message);$('#drawerError').scrollIntoView({block:'nearest'});$('#saveDraft').disabled=!state.connected;const lead=state.leads.find(l=>l.id===state.current);$('#modalApprove').disabled=!state.connected||lead?.status!=='review'||!$('#draftText').value.trim();}finally{state.mutating=false;}}
$('#saveDraft').onclick=()=>editDraft(false);$('#modalApprove').onclick=()=>editDraft(true);
async function batch(status){if(state.mutating)return;const from=status==='approved'?'review':'approved',ids=visibleLeads().filter(l=>state.selected.has(l.id)&&l.status===from).map(l=>l.id);if(!ids.length)return;state.mutating=true;render();try {for(const id of ids)await update(id,{status});toast(status==='approved'?`${ids.length} drafts approved. No email sent.`:`${ids.length} marked sent for the demo. No email delivered.`);}catch(error){message('#connectionError',error.message);}finally{state.mutating=false;state.selected.clear();try{await refresh();}catch{disconnected('Could not refresh saved leads. Reconnect to check the latest status.');}}}
$('#approveAll').onclick=()=>batch('approved');$('#sendDemo').onclick=()=>batch('sent');
$('#exportBtn').onclick=()=>{const cell=value=>'"'+String(/^[=+@\-\t\r]/.test(String(value))?"'"+value:value??'').replace(/"/g,'""')+'"';const rows=[['Company','Location','Website','Fit','Score','Research insight','Draft','Status'],...state.leads.map(l=>[l.name,l.location,l.site,l.fit,l.score,l.insight,l.draft,l.status])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='leadflow-pipeline.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function sourceControls(){const source=$('#source').value,csv=source==='csv';$('#csvLabel').hidden=!csv;$('#onlineOptions').hidden=csv;$('#sourceHint').textContent=csv?'CSV headers: company, location, website. Up to 25 unique companies.':source==='firecrawl'?'Search and AI research use provider credits. Candidate names and locations need verification.':'Apollo requires Company Search access and uses provider credits. Research also uses your AI service.';}
$('#source').onchange=sourceControls;$('#reconnect').onclick=connect;
$('#fitHelpButton').onclick=()=>{const hidden=!$('#fitHelp').hidden;$('#fitHelp').hidden=hidden;$('#fitHelpButton').setAttribute('aria-expanded',String(!hidden));};
document.querySelectorAll('.nav a').forEach(a=>a.onclick=()=>{if(a.hash==='#approval')filter('review');if(a.hash==='#history')$('#history').open=true;document.querySelectorAll('.nav a').forEach(b=>{b.classList.toggle('active',a===b);if(a===b)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});});
sourceControls();render();connect();
