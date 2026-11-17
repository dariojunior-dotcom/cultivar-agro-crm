import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 if(req.method!=="POST")return reply({error:"Método não permitido"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Autenticação necessária"},401);
  const auth=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user)return reply({error:"Sessão inválida"},401);
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:manager,error:managerError}=await admin.from("profiles").select("*").eq("id",user.id).single();
  if(managerError||!manager||!["gestor","admin","administrador"].includes(String(manager.role||manager.papel||manager.tipo||"").toLowerCase())||manager.active===false||manager.ativo===false)return reply({error:"Somente gestor ativo"},403);
  const body=await req.json(),acao=String(body.acao||"");
  if(acao==="convidar"){
   const nome=String(body.nome||"").trim(),email=String(body.email||"").trim().toLowerCase();
   if(nome.length<2||nome.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return reply({error:"Nome ou e-mail inválido"},400);
   const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{data:{nome}});
   if(error)return reply({error:error.message},400);
   // Profile creation depends on the existing auth trigger/schema; do not grant permissions client-side.
   return reply({ok:true,id:data.user?.id,warning:"Confirme que o gatilho de perfis criou o vendedor com papel correto."});
  }
  if(acao==="desativar"||acao==="reativar"){
   const id=String(body.id||"");
   if(!/^[0-9a-f-]{36}$/i.test(id)||id===user.id)return reply({error:"Vendedor inválido"},400);
   const {data:profile,error:pErr}=await admin.from("profiles").select("*").eq("id",id).single();
   if(pErr||!profile||!["vendedor","seller"].includes(String(profile.role||profile.papel||profile.tipo||"").toLowerCase()))return reply({error:"Somente perfis de vendedores podem ser alterados"},400);
   const active=acao==="reativar";
   const {error:banError}=await admin.auth.admin.updateUserById(id,{ban_duration:active?"none":"876000h"});
   if(banError)return reply({error:banError.message},400);
   const col=Object.hasOwn(profile,"ativo")?"ativo":Object.hasOwn(profile,"active")?"active":null;
   if(col){const {error:e}=await admin.from("profiles").update({[col]:active}).eq("id",id);if(e)return reply({error:"Bloqueio Auth aplicado, mas perfil não atualizado: "+e.message},500);}
   return reply({ok:true});
  }
  return reply({error:"Ação não permitida"},400);
 }catch(e){return reply({error:e instanceof Error?e.message:"Erro inesperado"},500);}
});
