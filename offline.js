/* Cultivar Agro offline queue. IndexedDB is device-local, not encrypted; only use on trusted devices. */
(function(){
 const DB='cultivar-offline-v1', STORE='items';
 function database(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DB,2);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});if(!d.objectStoreNames.contains('snapshots'))d.createObjectStore('snapshots',{keyPath:'id'})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
 async function run(mode,fn){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let result;try{result=fn(store)}catch(e){db.close();reject(e);return}tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)}})}
 async function all(){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const q=tx.objectStore(STORE).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close()})}
 async function enqueue(type,owner,payload,files=[]){const item={id:crypto.randomUUID(),type,owner,payload,files:Array.from(files),created:new Date().toISOString()};await run('readwrite',store=>store.put(item));return item}
 async function cache(owner,type,data){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({id:owner+':'+type,data});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
 async function cached(owner,type){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readonly');const q=tx.objectStore('snapshots').get(owner+':'+type);q.onsuccess=()=>resolve(q.result?.data||null);q.onerror=()=>reject(q.error);tx.oncomplete=()=>db.close()})}
 async function remove(id){await run('readwrite',store=>store.delete(id))}
 async function pending(owner){return (await all()).filter(x=>x.owner===owner)}
 let busy=false;
 async function sync(sb,owner){
  if(busy||!navigator.onLine||!sb||!owner)return {busy:true};
  busy=true;let sent=0,failed=[];
  try{
   const {data:{user},error:authError}=await sb.auth.getUser();if(authError||!user||user.id!==owner)throw Error('Entre novamente para sincronizar.');
   for(const item of await pending(owner)){
    try{
     if(item.type==='oportunidade'){
      // Stable client-generated UUID ensures safe retries after an uncertain network response.
      const {data:existing,error:lookupError}=await sb.from('oportunidades').select('id').eq('id',item.id).maybeSingle();
      if(lookupError)throw Error('Consulta do registro no Supabase: '+(lookupError.message||String(lookupError)));
      if(!existing){const {error}=await sb.from('oportunidades').insert({...item.payload,id:item.id});if(error)throw Error('Gravação da oportunidade: '+(error.message||String(error)))}
     }else if(item.type==='visita'){
      const {data:existing,error:lookupError}=await sb.from('visitas').select('id').eq('id',item.id).maybeSingle();
      if(lookupError)throw lookupError;
      if(!existing){const {error}=await sb.from('visitas').insert({...item.payload,id:item.id});if(error)throw Error('Gravação da visita: '+(error.message||String(error)))}
      for(let n=0;n<item.files.length;n++){
       const file=item.files[n];
       const filename=typeof file?.name==='string'?file.name:'foto.jpg';
       const ext=(filename.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').slice(0,8)||'jpg';
       // Safari may restore a File from IndexedDB as a Blob without its File metadata.
       // Supabase Storage needs actual binary content, not a metadata-only object.
       let bytes;
       if(file instanceof Blob)bytes=new Uint8Array(await file.arrayBuffer());
       else if(file?.bytes instanceof ArrayBuffer)bytes=new Uint8Array(file.bytes);
       else if(file?.bytes instanceof Uint8Array)bytes=file.bytes;
       else if(file instanceof ArrayBuffer)bytes=new Uint8Array(file);
       else if(file instanceof Uint8Array)bytes=file;
       else throw Error('Foto '+(n+1)+' sem conteúdo binário recuperável no navegador. Registro preservado; não apague os dados do Safari.');
       if(!bytes.byteLength)throw Error('Foto '+(n+1)+' está vazia no armazenamento local. Registro preservado; não apague os dados do Safari.');
       const responsavel=item.payload.vendedor_id;
       if(!responsavel)throw Error('Visita sem vendedor responsável.');
       const path=responsavel+'/'+item.id+'/'+item.id+'-'+n+'.'+ext;
       const {data:meta,error:metaErr}=await sb.from('visitas_fotos').select('id').eq('caminho_arquivo',path).maybeSingle();
       if(metaErr)throw Error('Consulta do registro da foto '+(n+1)+': '+(metaErr.message||String(metaErr)));
       if(!meta){
        const {error:uploadErr}=await sb.storage.from('fotos-visitas').upload(path,bytes,{contentType:file?.type||'image/jpeg',upsert:false});
        if(uploadErr&&!/already exists|duplicate/i.test(uploadErr.message||''))throw Error('Envio da foto '+(n+1)+' ao Storage: '+(uploadErr.message||String(uploadErr)));
        const {error:insertErr}=await sb.from('visitas_fotos').insert({visita_id:item.id,vendedor_id:item.payload.vendedor_id,caminho_arquivo:path});
        if(insertErr)throw Error('Cadastro da foto '+(n+1)+' no Supabase: '+(insertErr.message||String(insertErr)));
       }
      }
     }else throw Error('Tipo de registro desconhecido.');
     await remove(item.id);sent++;
    }catch(e){failed.push({id:item.id,error:e.message||String(e)})}
   }
   return {sent,failed};
  }finally{busy=false}
 }
 window.CultivarOffline={enqueue,pending,sync,cache,cached};
})();
