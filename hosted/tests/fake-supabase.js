/* In-browser stand-in for supabase-js, for testing the hosted shim. Data lives in localStorage "fakesb". */
(function(){
  function load(){ try { return JSON.parse(localStorage.getItem('fakesb')||'null') || null; } catch(e){ return null; } }
  var st = load() || { docs: {}, users: { 'paolo@ask-karla.com': 'paolo-pass-123' }, session: null, files: {} };
  if (!Object.keys(st.docs).length) {
    st.docs['z1users/paolo_ask_karla_com'] = { email:'paolo@ask-karla.com', name:'Paolo', role:'Super Admin', status:'active', pages:[], mustChange:false };
    st.docs['z1users/karla_ask_karla_com'] = { email:'karla@ask-karla.com', name:'Karla', role:'Super Admin', status:'active', pages:[], mustChange:false };
  }
  function save(){ Storage.prototype.__fakeSet ? 0 : 0; window.__fakeSave(); }
  window.__fakeSave = function(){ var raw = JSON.stringify(st); var set = Object.getPrototypeOf(localStorage).__proto__ ? null : null; localStorage.__proto__.constructor; window.__nativeSet.call(localStorage,'fakesb',raw); };
  window.__nativeSet = Storage.prototype.setItem;
  var chans = [];
  function parentOf(p){ return p.replace(/\/[^/]+$/,''); }
  function emit(type, path, data){ chans.forEach(function(c){ c({ eventType:type, new: type==='DELETE'?{}:{path:path,data:data,updated_by:window.__otherWriter||(st.session&&st.session.user.email)}, old:{path:path} }); }); }
  window.__fakeRemote = function(path, data){ st.docs[path]=data; window.__fakeSave(); var w=window.__otherWriter; window.__otherWriter='karla@ask-karla.com'; emit('UPDATE', path, data); window.__otherWriter=w; };
  window.__fakeState = st;
  function Q(table){ this.f=[]; this.op='select'; }
  Q.prototype.select=function(){ this.op = this.op==='select'?'select':this.op; return this; };
  Q.prototype.eq=function(c,v){ this.f.push(function(r){ return c==='path'? r.path===v : parentOf(r.path)===v; }); return this; };
  Q.prototype.like=function(c,v){ var pre=v.replace('%',''); this.f.push(function(r){ return r.path.indexOf(pre)===0; }); return this; };
  Q.prototype.in=function(c,v){ this.f.push(function(r){ return v.indexOf(r.path)>-1; }); return this; };
  Q.prototype.maybeSingle=function(){ this.single=true; return this; };
  Q.prototype.upsert=function(rows){ this.op='upsert'; this.rows=[].concat(rows); return this; };
  Q.prototype.update=function(d){ this.op='update'; this.patch=d; return this; };
  Q.prototype.delete=function(){ this.op='delete'; return this; };
  Q.prototype.then=function(res, rej){
    var self=this, all=Object.keys(st.docs).map(function(p){ return {path:p, data:JSON.parse(JSON.stringify(st.docs[p]))}; });
    var match=all.filter(function(r){ return self.f.every(function(f){ return f(r); }); });
    var out={ data:null, error:null };
    if(this.op==='select'){ out.data = this.single ? (match[0]||null) : match; }
    else if(this.op==='upsert'){ this.rows.forEach(function(r){ var d=JSON.parse(JSON.stringify(r.data)); if(r.path.indexOf('z1users/')===0) delete d.pw; st.docs[r.path]=d; emit('UPDATE', r.path, d); }); }
    else if(this.op==='update'){ match.forEach(function(r){ st.docs[r.path]=self.patch.data; emit('UPDATE', r.path, self.patch.data); }); }
    else if(this.op==='delete'){ match.forEach(function(r){ delete st.docs[r.path]; emit('DELETE', r.path); }); }
    window.__fakeSave();
    return Promise.resolve(out).then(res, rej);
  };
  var authCbs=[];
  var client = {
    from: function(){ window.__fromCalls = (window.__fromCalls||0)+1; return new Q(); },
    rpc: function(name){ window.__rpcCalls = (window.__rpcCalls||0)+1; if (window.__noDemoFn) return Promise.resolve({ data:null, error:{ message:'Could not find the function public.z1_demo' } }); var d = st.docs['meta/demo']; return Promise.resolve({ data: d ? { on: d.on !== false, pages: d.pages || null } : null, error:null }); },
    auth: {
      stopAutoRefresh: function(){ window.__stoppedRefresh = true; },
      getSession: function(){ return Promise.resolve({ data:{ session: st.session } }); },
      signInWithPassword: function(o){ if(st.users[o.email]===o.password){ st.session={ access_token:'tok', user:{ email:o.email, app_metadata:{provider:'email'} } }; window.__fakeSave(); return Promise.resolve({ data:{ session: st.session }, error:null }); } return Promise.resolve({ data:{}, error:{ message:'Invalid login credentials' } }); },
      signInWithOAuth: function(){ return Promise.resolve({ error:{ message:'Microsoft sign-in is not set up in this test' } }); },
      signOut: function(){ st.session=null; window.__fakeSave(); return Promise.resolve({}); },
      updateUser: function(o){ st.users[st.session.user.email]=o.password; window.__fakeSave(); return Promise.resolve({ data:{}, error:null }); },
      onAuthStateChange: function(cb){ authCbs.push(cb); return { data:{ subscription:{ unsubscribe:function(){} } } }; },
    },
    storage: { from: function(){ return {
      upload: function(id, blob, o){ return blob.arrayBuffer().then(function(b){ st.files[id]={ type:o.contentType, b64: btoa(String.fromCharCode.apply(null,new Uint8Array(b))) }; window.__fakeSave(); return { data:{ path:id }, error:null }; }); },
      list: function(){ return Promise.resolve({ data: Object.keys(st.files).map(function(k){ return { name:k, metadata:{ size: st.files[k].b64.length, mimetype: st.files[k].type } }; }), error:null }); },
      remove: function(ids){ ids.forEach(function(i){ delete st.files[i]; }); window.__fakeSave(); return Promise.resolve({ error:null }); },
    }; } },
    functions: { invoke: function(name, o){ var b=o.body; if(b.action==='password'){ var pw='Temp-'+Math.random().toString(36).slice(2,8); st.users[b.email]=pw; window.__fakeSave(); window.__lastTemp=pw; return Promise.resolve({ data:{ password: pw }, error:null }); } return Promise.resolve({ data:{ ok:true }, error:null }); } },
    channel: function(){ var ch={ on:function(a,b,cb){ chans.push(cb); return ch; }, subscribe:function(){ return ch; } }; return ch; },
  };
  window.supabase = { createClient: function(){ return client; } };
})();
