import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ['SCHEDULER_ENABLED'] = 'false'
from fastapi.testclient import TestClient
from backend import storage
from backend.main import app, run_pipeline
from backend.providers import parse_csv, public_url, scrape_company, apollo_search, firecrawl_search

RESULT = dict(fit='Good fit', score=88, summary='Evidence summary.', reason='Target match.', draft='A specific draft.')


class AppTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = storage.DB_PATH
        storage.DB_PATH = Path(self.tmp.name) / 'test.sqlite3'
        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        storage.DB_PATH = self.old
        self.tmp.cleanup()

    def seed(self):
        storage.add_lead(dict(id='l', name='Company', run_id='r', target='test', draft='Original'))

    def test_pages_and_secrets(self):
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.get('/app.js').status_code,200)
        css=self.client.get('/styles.css')
        self.assertEqual(css.status_code,200)
        self.assertIn('text/css',css.headers['content-type'])
        self.assertEqual(self.client.get('/.env').status_code,404)
        health=self.client.get('/api/health').json()
        self.assertIsInstance(health['integrations']['gemini'],bool)
        self.assertEqual(self.client.get('/api/runs/missing').status_code,404)
        self.assertEqual(self.client.get('/api/leads?status=nonsense').status_code,400)

    def test_csv_run_and_approval_persistence(self):
        with patch('backend.main.research_graph.invoke',return_value=RESULT):
            r=self.client.post('/api/runs/csv?target=dentists&offer=Booking',files={'file':('test.csv',b'company,location,website\n"A, Dental","Austin, TX",example.com\n')})
        self.assertEqual(r.status_code,202,r.text)
        run=self.client.get('/api/runs/'+r.json()['id']).json()
        self.assertEqual(run['status'],'completed')
        lead=self.client.get('/api/leads').json()[0]
        url='/api/leads/'+lead['id']
        self.assertEqual(self.client.patch(url,json={'status':'sent'}).status_code,409)
        self.assertEqual(self.client.patch(url,json={'status':'approved'}).status_code,200)
        saved=self.client.patch(url,json={'draft':'New draft'}).json()
        self.assertEqual(saved['status'],'review')
        self.assertEqual(self.client.patch(url,json={'status':'approved'}).status_code,200)
        self.assertEqual(self.client.patch(url,json={'draft':'Tampered','status':'sent'}).status_code,409)
        self.assertEqual(self.client.patch(url,json={'status':'sent'}).status_code,200)
        self.assertEqual(self.client.patch(url,json={'draft':'After send'}).status_code,409)
        self.assertEqual(storage.get_lead(lead['id'])['draft'],'New draft')

    def test_invalid_updates(self):
        self.seed()
        for payload in ({'draft':None},{'status':None},{'status':'hacked'},{'extra':True},{'draft':'x'*4001}):
            self.assertEqual(self.client.patch('/api/leads/l',json=payload).status_code,422)
        self.assertEqual(self.client.patch('/api/leads/l',json={'draft':' ','status':'approved'}).status_code,409)
        self.assertEqual(self.client.patch('/api/leads/missing',json={'draft':'x'}).status_code,404)

    def test_partial_and_redacted_errors(self):
        run=storage.create_run('test','csv')
        with patch.dict(os.environ,{'GEMINI_API_KEY':'secret-test'}),patch('backend.main.research_graph.invoke',side_effect=[RuntimeError('secret-test quota'),RESULT]):
            run_pipeline(run,'test','csv',[{'name':'Bad'},{'name':'Good'}])
        result=storage.get_run(run)
        self.assertEqual(result['status'],'partial')
        self.assertEqual(result['processed'],2)
        self.assertNotIn('secret-test',result['error'])
        self.assertEqual(len(storage.list_leads()),1)

    def test_upload_validation(self):
        for name,data,code in [('test.txt',b'hi',415),('test.csv',b'wrong\nvalue',400),('test.csv',b'company,location\nA,Austin,TX',400),('test.csv',b'\xff',400),('test.csv',b'a'*2000001,413)]:
            self.assertEqual(self.client.post('/api/runs/csv?target=dentists',files={'file':(name,data)}).status_code,code)
        self.assertEqual(self.client.post('/api/runs/csv?target=%20%20%20',files={'file':('test.csv',b'company\nA')}).status_code,400)

    def test_csv_limits_and_quotes(self):
        rows=parse_csv('\ufeffcompany,location,website\n"A, Dental","Austin, TX",example.com\n"A, Dental","Austin, TX",example.com\n')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['site'],'https://example.com')
        with self.assertRaises(ValueError):parse_csv('company\n'+'\n'.join(str(x) for x in range(26)))
        with self.assertRaises(ValueError):parse_csv('company,website\nA,file:///etc/passwd')

    def test_private_addresses(self):
        for address in ['http://127.0.0.1','http://[::1]','http://169.254.169.254','file:///etc/passwd']:
            with self.assertRaises(ValueError):public_url(address)

    def test_scraper_firecrawl_and_fallback(self):
        import httpx
        with patch('backend.providers.public_url',side_effect=lambda u:u),patch('backend.providers.setting',return_value='key'),patch('backend.providers.httpx.post',return_value=httpx.Response(200,json={'data':{'markdown':'Real evidence'}},request=httpx.Request('POST','https://api.firecrawl.dev/v2/scrape'))):
            self.assertEqual(scrape_company('https://example.com'),'Real evidence')
        with patch('backend.providers.public_url',side_effect=lambda u:u),patch('backend.providers.setting',return_value=''),patch('backend.providers.httpx.get',return_value=httpx.Response(200,text='<p>Evidence</p><script>ignore</script>',request=httpx.Request('GET','https://example.com'))):
            self.assertEqual(scrape_company('https://example.com'),'Evidence')

    def test_apollo_mapping_and_errors(self):
        import httpx
        with patch('backend.providers.setting',return_value='key'),patch('backend.providers.httpx.post',return_value=httpx.Response(200,json={'organizations':[{'name':'Clinic','primary_domain':'example.com'}]})) as call:
            self.assertEqual(apollo_search('Dentists in Texas')[0]['site'],'https://example.com')
            self.assertEqual(call.call_args.kwargs['json']['organization_locations'],['Texas'])
        with patch('backend.providers.setting',return_value='key'),patch('backend.providers.httpx.post',return_value=httpx.Response(429)):
            with self.assertRaisesRegex(RuntimeError,'rate limit'):apollo_search('Dentists')

    def test_apollo_access_diagnostics(self):
        import httpx
        error={'error_details':{'code':'AUTH.AUTHORIZATION.ENDPOINT_ACCESS_DENIED','message':'Your team is not permitted to call this endpoint.'}}
        with patch('backend.providers.setting',return_value='private-test-token'),patch('backend.providers.httpx.post',return_value=httpx.Response(403,json=error)):
            with self.assertRaisesRegex(RuntimeError,'ENDPOINT_ACCESS_DENIED.*Your team.*Apollo support'):apollo_search('Dentists')
        for response in [httpx.Response(403,text='blocked'),httpx.Response(403,json={'error':'Rejected private-test-token'}),httpx.Response(401,json={'error_details':{'message':'Invalid key'}})]:
            with patch('backend.providers.setting',return_value='private-test-token'),patch('backend.providers.httpx.post',return_value=response):
                with self.assertRaises(RuntimeError) as caught:apollo_search('Dentists')
                self.assertNotIn('private-test-token',str(caught.exception))
                self.assertIn(str(response.status_code),str(caught.exception))

    def test_interrupted_runs_recovered(self):
        run=storage.create_run('test','csv')
        storage.recover_interrupted_runs()
        self.assertEqual(storage.get_run(run)['status'],'failed')
        self.assertIn('restarted',storage.get_run(run)['error'])

    def test_schedule_and_no_results(self):
        from backend.main import run_scheduled_pipeline, start_and_execute_apollo
        with patch('backend.main.setting',side_effect=lambda name,default='':'csv' if name=='LEAD_SOURCE' else default),patch('backend.main.research_graph.invoke',return_value=RESULT):
            run_scheduled_pipeline()
        self.assertEqual(storage.list_runs()[0]['status'],'completed')
        run=storage.create_run('test','apollo')
        with patch('backend.main.apollo_search',return_value=[]):start_and_execute_apollo(run,'test',3)
        self.assertEqual(storage.get_run(run)['total'],0)
        self.assertEqual(storage.get_run(run)['status'],'completed')

    def test_model_graph_with_fixture_model(self):
        from backend.research_graph import research_graph, ResearchOutput
        with patch('backend.research_graph.scrape_company',return_value='Family dentistry'),patch('backend.research_graph.LLM_PROVIDER','gemini'),patch('backend.research_graph.setting',return_value='test-key'),patch('backend.research_graph.ChatGoogleGenerativeAI') as model:
            model.return_value.with_structured_output.return_value.invoke.return_value=ResearchOutput(**RESULT)
            result=research_graph.invoke({'name':'Test','site':'https://example.com','target':'dentists','offer':'Booking software'})
            self.assertEqual(result['score'],88)
            prompt=model.return_value.with_structured_output.return_value.invoke.call_args.args[0]
            self.assertIn('Booking software',prompt)

    def test_online_discovery_route(self):
        with patch('backend.main.setting',return_value='configured'),patch('backend.main.firecrawl_search',return_value=[dict(name='Online Clinic',location='Not verified',site='https://example.com')]) as search,patch('backend.main.research_graph.invoke',return_value=RESULT):
            response=self.client.post('/api/runs',json={'target':'Dentists in Texas','source':'firecrawl','limit':3,'offer':'Scheduling'})
        self.assertEqual(response.status_code,202,response.text)
        search.assert_called_once_with('Dentists in Texas',3)
        self.assertEqual(storage.get_run(response.json()['id'])['source'],'firecrawl')
        self.assertEqual(storage.list_leads()[0]['name'],'Online Clinic')
        self.assertEqual(storage.list_leads()[0]['status'],'review')
        for source in ['bad','csv']:
            self.assertEqual(self.client.post('/api/runs',json={'target':'Dentists','source':source}).status_code,422)
        with patch('backend.main.setting',return_value=''):
            self.assertEqual(self.client.post('/api/runs',json={'target':'Dentists','source':'firecrawl'}).status_code,400)

    def test_firecrawl_search_mapping_and_limits(self):
        import httpx
        results={'success':True,'data':{'web':[{'title':'Dental','url':'https://example.com/'},{'title':'Duplicate page','url':'https://www.example.com/about'},{'title':'Unsafe','url':'file:///tmp/x'},{'title':'Other','url':'https://other.example/'}]}}
        with patch('backend.providers.setting',return_value='key'),patch('backend.providers.httpx.post',return_value=httpx.Response(200,json=results)) as call:
            rows=firecrawl_search('Dentists in Texas',2)
            self.assertEqual(len(rows),2)
            self.assertEqual(rows[0]['location'],'Not verified')
            self.assertEqual(call.call_args.kwargs['json']['limit'],2)
        with patch('backend.providers.setting',return_value='key'),patch('backend.providers.httpx.post',return_value=httpx.Response(402)):
            with self.assertRaisesRegex(RuntimeError,'402'):firecrawl_search('Dentists')

if __name__=='__main__':unittest.main()
