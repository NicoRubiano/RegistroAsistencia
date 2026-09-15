(() => {
  console.info("FET Asistencias v8 · base central Supabase cargada");
  const SUPABASE_URL = "https://imjfsbbmyhwpjiivhjwl.supabase.co";
  const SUPABASE_KEY = "sb_publishable_mRzzlWUdktiy2mYBIsXp-A_BTyCv_W0";
  const AUTH_KEY = "fet_asistencia_remote_token_v8";

  const seed = {
    university: { name:"FET", graceMinutes:10, sessionMinutes:20 },
    users:[], rooms:[], courses:[], groups:[], enrollments:[],
    attendanceSessions:[], attendanceRecords:[], audit:[]
  };

  let db = clone(seed);
  let current = null;
  let authToken = localStorage.getItem(AUTH_KEY) || "";
  let currentView = "dashboard";
  let refreshing = false;

  function clone(x){ return JSON.parse(JSON.stringify(x)); }

  async function rpc(name, params={}){
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    });

    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

    if(!res.ok){
      const msg = (data && (data.message || data.details || data.hint)) || `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function friendlyError(err){
    const m = String(err?.message || err || "");
    if(m.includes("INVALID_CREDENTIALS")) return "Correo o contraseña incorrectos";
    if(m.includes("SESSION_INVALID")) return "Tu sesión venció. Inicia sesión nuevamente";
    if(m.includes("PIN_INCORRECT")) return "PIN incorrecto";
    if(m.includes("SESSION_CLOSED")) return "La asistencia ya no está activa";
    if(m.includes("NOT_ENROLLED")) return "No perteneces a este curso";
    if(m.includes("FORBIDDEN")) return "No tienes permiso para realizar esta acción";
    if(m.includes("duplicate key")) return "Ya existe un registro con esos datos";
    return "No fue posible completar la operación";
  }

  async function refreshFromCloud({renderAfter=true, silent=false}={}){
    if(!authToken || refreshing) return false;
    refreshing = true;
    try{
      const data = await rpc("fet_bootstrap", {p_token: authToken});
      db = {
        university: data.university || seed.university,
        users: data.users || [],
        rooms: data.rooms || [],
        courses: data.courses || [],
        groups: data.groups || [],
        enrollments: data.enrollments || [],
        attendanceSessions: data.attendanceSessions || [],
        attendanceRecords: data.attendanceRecords || [],
        audit: data.audit || []
      };
      current = data.currentUser || null;
      if(renderAfter) render();
      return true;
    }catch(err){
      if(String(err?.message||"").includes("SESSION_INVALID")){
        authToken = "";
        current = null;
        localStorage.removeItem(AUTH_KEY);
        renderLogin();
      }else if(!silent){
        toast(friendlyError(err));
      }
      return false;
    }finally{
      refreshing = false;
    }
  }

  async function audit(action, meta={}){
    if(!authToken) return;
    try{
      await rpc("fet_log_audit", {p_token:authToken, p_action:action, p_meta:meta});
    }catch(_){}
  }
  function uid(p="id"){ return p+"_"+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }
  function esc(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
  function fmtDate(x){ return new Date(x).toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"}); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function byId(arr,id){ return arr.find(x=>x.id===id); }
  function getCourse(g){ return byId(db.courses,g.courseId); }
  function getRoom(g){ return byId(db.rooms,g.roomId); }
  function getProfessor(g){ return byId(db.users,g.professorId); }
  function studentsOf(groupId){
    const ids=db.enrollments.filter(e=>e.groupId===groupId).map(e=>e.studentId);
    return db.users.filter(u=>ids.includes(u.id));
  }
  function groupsForUser(u){
    if(u.role==="admin") return db.groups;
    if(u.role==="professor") return db.groups.filter(g=>g.professorId===u.id);
    const ids=db.enrollments.filter(e=>e.studentId===u.id).map(e=>e.groupId);
    return db.groups.filter(g=>ids.includes(g.id));
  }
  function activeSessions(){
    const now=Date.now();
    return db.attendanceSessions.filter(s=>s.status==="open" && new Date(s.endsAt).getTime()>=now);
  }
  function activeForRoom(roomId){
    return activeSessions().filter(s=>s.roomId===roomId);
  }
  function roleName(r){ return ({admin:"Administrador",professor:"Profesor",student:"Estudiante"})[r]||r; }
  function toast(msg){
    const el=document.createElement("div"); el.className="toast"; el.textContent=msg; document.body.appendChild(el);
    setTimeout(()=>el.remove(),2600);
  }


  function render(){
    if(!current) return renderLogin();
    const u=byId(db.users,current.id) || current;
    current=u;
    document.getElementById("app").innerHTML = layout(u);
    bindCommon();
    renderView();
  }

  function renderLogin(){
    const roomParam = new URLSearchParams(location.search).get("room");
    document.getElementById("app").innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <section class="hero">
            <div class="tag">Sistema institucional de asistencia</div>
            <h1>FET<br><span style="color:var(--accent)">Asistencias</span></h1>
            <p>Plataforma institucional para el registro y control de asistencia académica.</p>
            ${roomParam?`<div class="notice">Accediste desde un NFC. Inicia sesión para entrar a la plataforma de asistencia.</div>`:""}
          </section>
          <section class="login-form">
            <h2>Iniciar sesión</h2>
            <label>Correo institucional</label>
            <input id="loginEmail" value="${roomParam?"ana.torres@universidad.edu":"laura.gomez@universidad.edu"}" />
            <label>Contraseña</label>
            <input id="loginPass" type="password" value="1234" />
            <button class="btn block" style="margin-top:18px" id="loginBtn">Entrar</button>
            <div class="demo-box">
              <b>Usuarios demo</b><br>
              Admin: admin@universidad.edu / 1234<br>
              Profesor: laura.gomez@universidad.edu / 1234<br>
              Estudiante: ana.torres@universidad.edu / 1234
            </div>
          </section>
        </div>
      </div>`;
    document.getElementById("loginBtn").onclick = async ()=>{
      const btn=document.getElementById("loginBtn");
      const email=document.getElementById("loginEmail").value.trim().toLowerCase();
      const pass=document.getElementById("loginPass").value;
      if(!email || !pass) return toast("Completa correo y contraseña");

      btn.disabled=true;
      btn.textContent="Ingresando...";
      try{
        const result=await rpc("fet_login",{p_email:email,p_password:pass});
        authToken=result.token;
        localStorage.setItem(AUTH_KEY,authToken);
        current=result.user;
        const fromNFC = new URLSearchParams(location.search).has("nfc") || new URLSearchParams(location.search).has("room");
        currentView = fromNFC && current.role==="student" ? "checkin" : "dashboard";
        await refreshFromCloud({renderAfter:false});
        render();
      }catch(err){
        toast(friendlyError(err));
      }finally{
        btn.disabled=false;
        btn.textContent="Entrar";
      }
    };
  }

  function layout(u){
    const nav = u.role==="admin" ? [
      ["dashboard","","Resumen"],["users","","Usuarios"],["courses","","Cursos y grupos"],["rooms","","Acceso al sistema"],["reports","","Reportes"],["audit","","Auditoría"]
    ] : u.role==="professor" ? [
      ["dashboard","","Mis clases"],["sessions","","Asistencias"],["reports","","Reportes"]
    ] : [
      ["dashboard","","Mis materias"],["checkin","","Marcar asistencia"],["history","","Mi historial"]
    ];
    return `<div class="layout">
      <aside class="sidebar">
        <div class="brand">FET <span>Asistencias</span></div>
        <nav class="nav">
          ${nav.map(n=>`<button data-view="${n[0]}" class="${currentView===n[0]?"active":""}">${n[1]} ${n[2]}</button>`).join("")}
        </nav>
        <div class="side-bottom">
          <div class="user-card"><b>${esc(u.name)}</b><small>${roleName(u.role)} · ${esc(u.email)}</small></div>
          <button class="btn ghost block" id="logoutBtn">Cerrar sesión</button>
        </div>
      </aside>
      <main id="main"></main>
    </div>`;
  }

  function bindCommon(){
    document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{currentView=b.dataset.view;render();});
    document.getElementById("logoutBtn").onclick=logout;
  }
  async function logout(){
    const token=authToken;
    authToken="";
    current=null;
    localStorage.removeItem(AUTH_KEY);
    currentView="dashboard";
    renderLogin();
    if(token){ try{ await rpc("fet_logout",{p_token:token}); }catch(_){} }
  }

  function renderView(){
    const m=document.getElementById("main");
    if(current.role==="admin"){
      ({dashboard:adminDashboard,users:adminUsers,courses:adminCourses,rooms:adminRooms,reports:reportsView,audit:auditView}[currentView]||adminDashboard)(m);
    } else if(current.role==="professor"){
      ({dashboard:profDashboard,sessions:profSessions,reports:reportsView}[currentView]||profDashboard)(m);
    } else {
      ({dashboard:studentDashboard,checkin:studentCheckin,history:studentHistory}[currentView]||studentDashboard)(m);
    }
  }

  function top(title,sub=""){
    return `<div class="topbar"><div><h1>${title}</h1>${sub?`<div class="muted">${sub}</div>`:""}</div><div class="muted">${new Date().toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div></div>`;
  }

  function adminDashboard(m){
    const open=activeSessions().length;
    m.innerHTML=top("Panel administrativo","Vista general del sistema") + `
      <div class="grid g4">
        <div class="card stat"><small>Estudiantes</small><b>${db.users.filter(u=>u.role==="student").length}</b></div>
        <div class="card stat"><small>Profesores</small><b>${db.users.filter(u=>u.role==="professor").length}</b></div>
        <div class="card stat"><small>Grupos</small><b>${db.groups.length}</b></div>
        <div class="card stat"><small>Sesiones activas</small><b>${open}</b></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card">
          <div class="section-title"><h3>Últimas sesiones</h3></div>
          ${sessionTable(db.attendanceSessions.slice().sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)).slice(0,6))}
        </div>
        <div class="card">
          <div class="section-title"><h3>Estado del prototipo</h3></div>
          <div class="notice">Los datos se guardan en <b>localStorage</b> del navegador. Sirve para demostración y pruebas. Para usarlo entre celulares y computadores diferentes en una universidad real, se debe conectar a una base de datos central y al inicio de sesión institucional.</div>
        </div>
      </div>`;
  }

  function adminUsers(m){
    m.innerHTML=top("Usuarios","Profesores, estudiantes y administradores") + `
      <div class="card">
        <div class="section-title"><h3>Directorio</h3><button class="btn" id="newUserBtn">+ Nuevo usuario</button></div>
        <table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Código</th><th></th></tr></thead>
        <tbody>${db.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="badge info">${roleName(u.role)}</span></td><td>${esc(u.studentCode||"—")}</td><td><button class="btn sm bad" data-del-user="${u.id}">Eliminar</button></td></tr>`).join("")}</tbody></table>
      </div>`;
    document.getElementById("newUserBtn").onclick=()=>showUserModal();
    document.querySelectorAll("[data-del-user]").forEach(b=>b.onclick=()=>{
      const id=b.dataset.delUser;
      if(id===current.id) return toast("No puedes eliminar tu propio usuario");
      if(!confirm("¿Eliminar usuario?")) return;
      (async()=>{
        try{
          await rpc("fet_delete_user",{p_token:authToken,p_user_id:id});
          await refreshFromCloud({renderAfter:false});
          render();
          toast("Usuario eliminado");
        }catch(err){ toast(friendlyError(err)); }
      })();
    });
  }

  function showUserModal(){
    modal(`
      <h2>Nuevo usuario</h2>
      <label>Nombre</label><input id="muName">
      <label>Correo institucional</label><input id="muEmail">
      <label>Contraseña inicial</label><input id="muPass" value="1234">
      <label>Rol</label><select id="muRole"><option value="student">Estudiante</option><option value="professor">Profesor</option><option value="admin">Administrador</option></select>
      <label>Código estudiantil (opcional)</label><input id="muCode">
      <div class="row" style="margin-top:18px"><button class="btn secondary" data-close>Cerrar</button><button class="btn" id="muSave">Guardar</button></div>
    `);
    document.getElementById("muSave").onclick=()=>{
      const name=val("muName"), email=val("muEmail").toLowerCase(), password=val("muPass"), role=val("muRole"), studentCode=val("muCode");
      if(!name||!email||!password) return toast("Completa los campos");
      if(db.users.some(u=>u.email.toLowerCase()===email)) return toast("Ese correo ya existe");
      (async()=>{
        try{
          await rpc("fet_create_user",{
            p_token:authToken,p_name:name,p_email:email,p_password:password,
            p_role:role,p_student_code:studentCode||null
          });
          closeModal();
          await refreshFromCloud({renderAfter:false});
          render();
          toast("Usuario creado");
        }catch(err){ toast(friendlyError(err)); }
      })();
    };
  }

  function adminCourses(m){
    const profs=db.users.filter(u=>u.role==="professor");
    m.innerHTML=top("Cursos y grupos","Estructura académica") + `
      <div class="grid g2">
        <div class="card">
          <div class="section-title"><h3>Cursos</h3><button class="btn sm" id="newCourseBtn">+ Curso</button></div>
          <table><thead><tr><th>Código</th><th>Nombre</th></tr></thead><tbody>${db.courses.map(c=>`<tr><td>${esc(c.code)}</td><td>${esc(c.name)}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="card">
          <div class="section-title"><h3>Grupos</h3><button class="btn sm" id="newGroupBtn">+ Grupo</button></div>
          <table><thead><tr><th>Curso</th><th>Grupo</th><th>Profesor</th><th>Salón</th><th></th></tr></thead><tbody>
            ${db.groups.map(g=>`<tr><td>${esc(getCourse(g)?.code||"")}</td><td>${esc(g.name)}</td><td>${esc(getProfessor(g)?.name||"Sin asignar")}</td><td>${esc(getRoom(g)?.code||"")}</td><td><button class="btn sm secondary" data-enroll="${g.id}">Matrícula</button></td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>`;
    document.getElementById("newCourseBtn").onclick=()=>modal(`
      <h2>Nuevo curso</h2><label>Código</label><input id="cCode"><label>Nombre</label><input id="cName">
      <div class="row" style="margin-top:18px"><button class="btn secondary" data-close>Cerrar</button><button class="btn" id="saveCourse">Guardar</button></div>`);
    document.addEventListener("click",function once(e){
      if(e.target?.id==="saveCourse"){
        const code=val("cCode"),name=val("cName"); if(!code||!name)return toast("Completa los campos");
        (async()=>{
          try{
            await rpc("fet_create_course",{p_token:authToken,p_code:code,p_name:name});
            closeModal();
            document.removeEventListener("click",once);
            await refreshFromCloud({renderAfter:false});
            render();
            toast("Curso creado");
          }catch(err){ toast(friendlyError(err)); }
        })();
      }
    });
    document.getElementById("newGroupBtn").onclick=()=>showGroupModal();
    document.querySelectorAll("[data-enroll]").forEach(b=>b.onclick=()=>showEnrollModal(b.dataset.enroll));
  }

  function showGroupModal(){
    modal(`<h2>Nuevo grupo</h2>
      <label>Curso</label><select id="gCourse">${db.courses.map(c=>`<option value="${c.id}">${esc(c.code)} · ${esc(c.name)}</option>`).join("")}</select>
      <label>Nombre del grupo</label><input id="gName" value="Grupo 01">
      <label>Profesor</label><select id="gProf">${db.users.filter(u=>u.role==="professor").map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select>
      <label>Salón</label><select id="gRoom">${db.rooms.map(r=>`<option value="${r.id}">${esc(r.code)} · ${esc(r.name)}</option>`).join("")}</select>
      <label>Horario</label><input id="gSchedule" placeholder="Lun/Mié 08:00-10:00">
      <div class="row" style="margin-top:18px"><button class="btn secondary" data-close>Cerrar</button><button class="btn" id="saveGroup">Guardar</button></div>`);
    document.getElementById("saveGroup").onclick=()=>{
      (async()=>{
        try{
          await rpc("fet_create_group",{
            p_token:authToken,
            p_course_id:val("gCourse"),
            p_name:val("gName"),
            p_professor_id:val("gProf"),
            p_room_id:val("gRoom"),
            p_schedule:val("gSchedule")
          });
          closeModal();
          await refreshFromCloud({renderAfter:false});
          render();
          toast("Grupo creado");
        }catch(err){ toast(friendlyError(err)); }
      })();
    };
  }

  function showEnrollModal(groupId){
    const g=byId(db.groups,groupId); const students=db.users.filter(u=>u.role==="student");
    modal(`<h2>Matrícula · ${esc(getCourse(g)?.name||"")}</h2>
      <div class="notice">Marca los estudiantes inscritos en este grupo.</div>
      <div style="margin-top:12px">${students.map(s=>{
        const checked=db.enrollments.some(e=>e.groupId===groupId&&e.studentId===s.id);
        return `<label style="display:flex;gap:10px;align-items:center;padding:8px 0"><input style="width:auto" type="checkbox" data-student="${s.id}" ${checked?"checked":""}> ${esc(s.name)} · ${esc(s.studentCode||"")}</label>`;
      }).join("")}</div>
      <div class="row" style="margin-top:18px"><button class="btn secondary" data-close>Cerrar</button><button class="btn" id="saveEnroll">Guardar</button></div>`);
    document.getElementById("saveEnroll").onclick=()=>{
      (async()=>{
        const studentIds=[...document.querySelectorAll("[data-student]:checked")].map(ch=>ch.dataset.student);
        try{
          await rpc("fet_set_enrollments",{p_token:authToken,p_group_id:groupId,p_student_ids:studentIds});
          closeModal();
          await refreshFromCloud({renderAfter:false});
          render();
          toast("Matrícula actualizada");
        }catch(err){ toast(friendlyError(err)); }
      })();
    };
  }

  function adminRooms(m){
    const link=nfcLink();
    m.innerHTML=top("Acceso al sistema","Acceso único a la plataforma institucional") + `
      <div class="grid g2">
        <div class="nfc-card">
          <div class="nfc-icon"></div>
          <h2>Acceso general</h2>
          <div class="muted">
            El acceso NFC únicamente abre la plataforma. La validación de asistencia se realiza dentro del sistema.
          </div>
          <label>Enlace para programar en las tarjetas NFC</label>
          <div class="code">${esc(link)}</div>
          <div class="row" style="margin-top:12px">
            <button class="btn secondary" id="copyNfcLink">Copiar enlace</button>
            <button class="btn" id="openNfcLink">Probar enlace</button>
          </div>
        </div>
        <div class="card">
          <h3>Cómo funciona</h3>
          <div class="notice">
            1. Estudiante o profesor toca cualquier NFC.<br><br>
            2. Se abre esta misma plataforma.<br><br>
            3. Inicia sesión con su usuario.<br><br>
            4. El profesor activa la asistencia de un curso.<br><br>
            5. A los estudiantes matriculados en ese curso les aparece esa asistencia activa.
          </div>
        </div>
      </div>`;
    document.getElementById("copyNfcLink").onclick=()=>{
      navigator.clipboard?.writeText(link);
      toast("Enlace NFC copiado");
    };
    document.getElementById("openNfcLink").onclick=()=>window.open(link,"_blank");
  }

  function nfcLink(){
    const base=location.href.split("?")[0].split("#")[0];
    return base+"?nfc=1";
  }

  function profDashboard(m){
    const gs=groupsForUser(current);
    m.innerHTML=top("Mis clases","Inicia asistencia con un clic") + `
      <div class="grid g3">${gs.map(g=>{
        const c=getCourse(g), room=getRoom(g), open=activeSessions().find(s=>s.groupId===g.id);
        return `<div class="card ${open?"session-live":""}">
          <div class="muted">${esc(c?.code||"")}</div><h3>${esc(c?.name||"")} · ${esc(g.name)}</h3>
          <div class="muted">${esc(g.schedule||"Sin horario")} · ${esc(room?.code||"")}</div>
          <div style="margin-top:14px">${open?`
            <div class="badge present">Sesión activa</div>
            <div class="muted" style="margin-top:10px">PIN DE ASISTENCIA</div>
            <div class="pin">${esc(String(open.pin))}</div>
            <div class="row">
              <button class="btn secondary" data-copy-pin="${open.id}">Copiar PIN</button>
              <button class="btn bad" data-close-session="${open.id}">Cerrar asistencia</button>
            </div>`:`<button class="btn block" data-start="${g.id}">Iniciar asistencia</button>`}</div>
        </div>`;
      }).join("")}</div>`;
    document.querySelectorAll("[data-start]").forEach(b=>b.onclick=()=>startSession(b.dataset.start));
    document.querySelectorAll("[data-close-session]").forEach(b=>b.onclick=()=>closeSession(b.dataset.closeSession));
    document.querySelectorAll("[data-copy-pin]").forEach(b=>b.onclick=()=>{
      const s=byId(db.attendanceSessions,b.dataset.copyPin);
      if(!s) return;
      navigator.clipboard?.writeText(String(s.pin));
      toast("PIN copiado: "+s.pin);
    });
  }

  async function startSession(groupId){
    try{
      const s=await rpc("fet_start_attendance",{p_token:authToken,p_group_id:groupId});
      await refreshFromCloud({renderAfter:false});
      render();
      toast("Asistencia iniciada. PIN: "+s.pin);
    }catch(err){
      toast(friendlyError(err));
    }
  }

  async function closeSession(id){
    try{
      await rpc("fet_close_attendance",{p_token:authToken,p_session_id:id});
      await refreshFromCloud({renderAfter:false});
      render();
      toast("Asistencia cerrada");
    }catch(err){
      toast(friendlyError(err));
    }
  }

  function profSessions(m){
    const gs=groupsForUser(current), ids=gs.map(g=>g.id);
    const sessions=db.attendanceSessions.filter(s=>ids.includes(s.groupId)).sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
    m.innerHTML=top("Asistencias","Sesiones, lista y correcciones") + `
      <div class="card">${sessions.length?sessionTable(sessions,true):`<div class="empty">Aún no hay sesiones.</div>`}</div>`;
    document.querySelectorAll("[data-session-detail]").forEach(b=>b.onclick=()=>showSessionDetail(b.dataset.sessionDetail));
    document.querySelectorAll("[data-export-session]").forEach(b=>b.onclick=()=>exportSessionXLSX(b.dataset.exportSession));
  }

  function sessionTable(sessions,details=false){
    if(!sessions.length)return `<div class="empty">Sin registros.</div>`;
    return `<table><thead><tr><th>Curso</th><th>Grupo</th><th>Fecha</th><th>Estado</th><th>Presentes</th>${details?"<th></th>":""}</tr></thead><tbody>
      ${sessions.map(s=>{
        const g=byId(db.groups,s.groupId), count=db.attendanceRecords.filter(r=>r.sessionId===s.id&&r.status!=="absent").length;
        return `<tr><td>${esc(getCourse(g)?.name||"")}</td><td>${esc(g?.name||"")}</td><td>${fmtDate(s.startedAt)}</td><td><span class="badge ${s.status==="open"?"present":"info"}">${s.status==="open"?"Abierta":"Cerrada"}</span></td><td>${count}/${studentsOf(s.groupId).length}</td>${details?`<td><div class="row"><button class="btn sm secondary" data-session-detail="${s.id}">Ver lista</button><button class="btn sm" data-export-session="${s.id}">Excel</button></div></td>`:""}</tr>`;
      }).join("")}</tbody></table>`;
  }

  function showSessionDetail(sessionId){
    const s=byId(db.attendanceSessions,sessionId), g=byId(db.groups,s.groupId), students=studentsOf(g.id);
    modal(`<h2>${esc(getCourse(g)?.name||"")} · ${esc(g.name)}</h2>
      <div class="muted">${fmtDate(s.startedAt)} · PIN ${s.pin}</div>
      <table style="margin-top:14px"><thead><tr><th>Estudiante</th><th>Estado</th><th>Hora</th><th>Cambiar</th></tr></thead><tbody>
      ${students.map(st=>{
        const r=db.attendanceRecords.find(x=>x.sessionId===s.id&&x.studentId===st.id);
        const status=r?.status||"absent";
        return `<tr><td>${esc(st.name)}</td><td><span class="badge ${status}">${status==="present"?"Presente":status==="late"?"Tarde":"Ausente"}</span></td><td>${r?fmtDate(r.checkedAt):"—"}</td>
        <td><select data-change-status="${st.id}" data-session="${s.id}"><option value="absent" ${status==="absent"?"selected":""}>Ausente</option><option value="present" ${status==="present"?"selected":""}>Presente</option><option value="late" ${status==="late"?"selected":""}>Tarde</option></select></td></tr>`;
      }).join("")}</tbody></table>
      <div class="row" style="margin-top:18px">
        <button class="btn secondary" data-close>Cerrar</button>
        <button class="btn" id="exportSessionExcel">Descargar Excel</button>
        <button class="btn" id="saveStatuses">Guardar cambios</button>
      </div>`);
    document.getElementById("exportSessionExcel").onclick=()=>exportSessionXLSX(s.id);
    document.getElementById("saveStatuses").onclick=async()=>{
      const selects=[...document.querySelectorAll("[data-change-status]")];
      try{
        for(const sel of selects){
          await rpc("fet_set_attendance_status",{
            p_token:authToken,
            p_session_id:s.id,
            p_student_id:sel.dataset.changeStatus,
            p_status:sel.value
          });
        }
        closeModal();
        await refreshFromCloud({renderAfter:false});
        render();
        toast("Asistencia actualizada");
      }catch(err){
        toast(friendlyError(err));
      }
    };
  }

  function reportsView(m){
    const gs=groupsForUser(current);
    m.innerHTML=top("Reportes","Descarga un Excel detallado listo para revisar o subir a otra plataforma") + `
      <div class="card">
        <div class="section-title"><h3>Por grupo</h3></div>
        <table><thead><tr><th>Curso</th><th>Grupo</th><th>Profesor</th><th>Estudiantes</th><th>Sesiones</th><th>Exportar</th></tr></thead><tbody>
        ${gs.map(g=>`<tr><td>${esc(getCourse(g)?.name||"")}</td><td>${esc(g.name)}</td><td>${esc(getProfessor(g)?.name||"")}</td><td>${studentsOf(g.id).length}</td><td>${db.attendanceSessions.filter(s=>s.groupId===g.id).length}</td><td><button class="btn sm" data-export="${g.id}">Excel</button></td></tr>`).join("")}
        </tbody></table>
      </div>`;
    document.querySelectorAll("[data-export]").forEach(b=>b.onclick=()=>exportGroupXLSX(b.dataset.export));
  }

  // ---------- EXPORTACIÓN EXCEL (.XLSX) SIN LIBRERÍAS EXTERNAS ----------
  // El archivo contiene exactamente:
  // Nombre completo | Fecha | Hora | Curso | Asistencia

  function xlsxXmlEscape(value){
    return String(value ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&apos;");
  }

  function xlsxCellRef(col,row){
    let n=col+1, letters="";
    while(n>0){
      const r=(n-1)%26;
      letters=String.fromCharCode(65+r)+letters;
      n=Math.floor((n-1)/26);
    }
    return letters+row;
  }

  function xlsxInlineCell(value,col,row,style=0){
    const ref=xlsxCellRef(col,row);
    const safe=xlsxXmlEscape(value);
    return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${safe}</t></is></c>`;
  }

  function crc32(bytes){
    let table=crc32.table;
    if(!table){
      table=crc32.table=[];
      for(let n=0;n<256;n++){
        let c=n;
        for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
        table[n]=c>>>0;
      }
    }
    let crc=0^(-1);
    for(let i=0;i<bytes.length;i++) crc=(crc>>>8)^table[(crc^bytes[i])&0xFF];
    return (crc^(-1))>>>0;
  }

  function u16(n){ return [n&255,(n>>>8)&255]; }
  function u32(n){ return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]; }

  function makeZip(files){
    const enc=new TextEncoder();
    const localParts=[];
    const centralParts=[];
    let offset=0;

    const pushBytes=(target,arr)=>target.push(...arr);

    for(const file of files){
      const nameBytes=enc.encode(file.name);
      const dataBytes=typeof file.data==="string" ? enc.encode(file.data) : file.data;
      const crc=crc32(dataBytes);

      const local=[];
      pushBytes(local,u32(0x04034b50));
      pushBytes(local,u16(20));
      pushBytes(local,u16(0));
      pushBytes(local,u16(0)); // Store: sin compresión
      pushBytes(local,u16(0));
      pushBytes(local,u16(0));
      pushBytes(local,u32(crc));
      pushBytes(local,u32(dataBytes.length));
      pushBytes(local,u32(dataBytes.length));
      pushBytes(local,u16(nameBytes.length));
      pushBytes(local,u16(0));
      pushBytes(local,nameBytes);
      pushBytes(local,dataBytes);
      localParts.push(new Uint8Array(local));

      const central=[];
      pushBytes(central,u32(0x02014b50));
      pushBytes(central,u16(20));
      pushBytes(central,u16(20));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u32(crc));
      pushBytes(central,u32(dataBytes.length));
      pushBytes(central,u32(dataBytes.length));
      pushBytes(central,u16(nameBytes.length));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u16(0));
      pushBytes(central,u32(0));
      pushBytes(central,u32(offset));
      pushBytes(central,nameBytes);
      centralParts.push(new Uint8Array(central));

      offset += local.length;
    }

    const centralSize=centralParts.reduce((s,p)=>s+p.length,0);
    const end=[];
    pushBytes(end,u32(0x06054b50));
    pushBytes(end,u16(0));
    pushBytes(end,u16(0));
    pushBytes(end,u16(files.length));
    pushBytes(end,u16(files.length));
    pushBytes(end,u32(centralSize));
    pushBytes(end,u32(offset));
    pushBytes(end,u16(0));

    return new Blob([...localParts,...centralParts,new Uint8Array(end)],{
      type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function formatExcelDate(iso){
    const d=new Date(iso);
    return d.toLocaleDateString("es-CO",{year:"numeric",month:"2-digit",day:"2-digit"});
  }

  function formatExcelTime(iso){
    const d=new Date(iso);
    return d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",hour12:false});
  }

  function buildAttendanceRows(groupId, onlySessionId=null){
    const g=byId(db.groups,groupId);
    if(!g) return [];
    const course=getCourse(g);
    const students=studentsOf(groupId).slice().sort((a,b)=>a.name.localeCompare(b.name,"es"));
    const sessions=db.attendanceSessions
      .filter(s=>s.groupId===groupId && (!onlySessionId || s.id===onlySessionId))
      .sort((a,b)=>new Date(a.startedAt)-new Date(b.startedAt));

    const rows=[];
    sessions.forEach(s=>{
      students.forEach(st=>{
        const r=db.attendanceRecords.find(x=>x.sessionId===s.id && x.studentId===st.id);
        rows.push([
          st.name,
          formatExcelDate(s.startedAt),
          r ? formatExcelTime(r.checkedAt) : "Sin registro",
          `${course?.name||""} · ${g.name}`,
          r ? "Asistió" : "No asistió"
        ]);
      });
    });
    return rows;
  }

  function createAttendanceXLSX(rows, sheetName="Asistencia"){
    const headers=["Nombre completo del estudiante","Fecha","Hora","Curso","Asistencia"];
    const all=[headers,...rows];

    const sheetRows=all.map((row,ri)=>{
      const cells=row.map((value,ci)=>{
        let style=0;
        if(ri===0) style=1;
        else if(ci===4) style=value==="Asistió" ? 2 : 3;
        return xlsxInlineCell(value,ci,ri+1,style);
      }).join("");
      return `<row r="${ri+1}">${cells}</row>`;
    }).join("");

    const lastRow=Math.max(1,all.length);
    const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="32" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="34" customWidth="1"/>
    <col min="5" max="5" width="16" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:E${lastRow}"/>
</worksheet>`;

    const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

    const workbookXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="${xlsxXmlEscape(sheetName.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

    const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    return makeZip([
      {name:"[Content_Types].xml",data:contentTypes},
      {name:"_rels/.rels",data:rootRels},
      {name:"xl/workbook.xml",data:workbookXml},
      {name:"xl/_rels/workbook.xml.rels",data:workbookRels},
      {name:"xl/worksheets/sheet1.xml",data:sheetXml},
      {name:"xl/styles.xml",data:stylesXml}
    ]);
  }

  function downloadXLSX(blob,filename){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=filename.endsWith(".xlsx") ? filename : filename+".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }

  function exportSessionXLSX(sessionId){
    const s=byId(db.attendanceSessions,sessionId);
    if(!s) return toast("No se encontró la sesión");
    const g=byId(db.groups,s.groupId);
    const rows=buildAttendanceRows(g.id,s.id);
    if(!rows.length) return toast("No hay estudiantes para exportar");

    const course=getCourse(g);
    const date=new Date(s.startedAt).toISOString().slice(0,10);
    const filename=`asistencia_${course?.code||"curso"}_${g.name.replace(/\s+/g,"_")}_${date}.xlsx`;
    downloadXLSX(createAttendanceXLSX(rows,"Asistencia"),filename);
    audit("Exportar Excel de sesión",{sessionId});
    toast("Excel descargado");
  }

  function exportGroupXLSX(groupId){
    const g=byId(db.groups,groupId);
    if(!g) return;
    const sessions=db.attendanceSessions.filter(s=>s.groupId===groupId);
    if(!sessions.length) return toast("Este grupo todavía no tiene sesiones de asistencia");

    const rows=buildAttendanceRows(groupId);
    const course=getCourse(g);
    const filename=`historial_asistencia_${course?.code||"curso"}_${g.name.replace(/\s+/g,"_")}.xlsx`;
    downloadXLSX(createAttendanceXLSX(rows,"Historial asistencia"),filename);
    audit("Exportar Excel de grupo",{groupId});
    toast("Excel descargado");
  }

  function auditView(m){
    m.innerHTML=top("Auditoría","Últimos cambios registrados") + `<div class="card"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
      ${db.audit.map(a=>`<tr><td>${fmtDate(a.at)}</td><td>${esc(byId(db.users,a.userId)?.name||a.userId)}</td><td>${esc(a.action)}</td><td class="muted">${esc(JSON.stringify(a.meta))}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function studentDashboard(m){
    const gs=groupsForUser(current);
    m.innerHTML=top("Mis materias","Grupos en los que estás matriculado") + `<div class="grid g3">${gs.map(g=>`
      <div class="card"><div class="muted">${esc(getCourse(g)?.code||"")}</div><h3>${esc(getCourse(g)?.name||"")} · ${esc(g.name)}</h3><div class="muted">${esc(getProfessor(g)?.name||"")} · ${esc(g.schedule||"")}</div></div>`).join("")}</div>`;
  }

  function studentCheckin(m){
    const myGroups=groupsForUser(current);
    const myGroupIds=myGroups.map(g=>g.id);

    // El acceso NFC únicamente dirige a esta plataforma.
    // Las asistencias visibles dependen exclusivamente de:
    // 1) que el profesor haya iniciado la asistencia,
    // 2) que el estudiante esté matriculado en ese grupo.
    const sessions=activeSessions()
      .filter(s=>myGroupIds.includes(s.groupId))
      .sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));

    m.innerHTML=top("Marcar asistencia","Aquí aparecen únicamente las asistencias activas de tus cursos") + `
      ${sessions.length ? `
        <div class="grid g2">
          ${sessions.map(s=>{
            const g=byId(db.groups,s.groupId);
            const c=getCourse(g);
            const prof=getProfessor(g);
            const already=db.attendanceRecords.find(r=>r.sessionId===s.id&&r.studentId===current.id);

            return `<div class="card session-live">
              <div class="row" style="align-items:flex-start">
                <div>
                  <div class="badge present">ASISTENCIA ACTIVA</div>
                  <div class="muted" style="margin-top:10px">${esc(c?.code||"")}</div>
                  <h2 style="margin:4px 0 6px">${esc(c?.name||"")} · ${esc(g?.name||"")}</h2>
                  <div class="muted">${esc(prof?.name||"Profesor")}</div>
                </div>
                <div class="fit muted" style="text-align:right">
                  Cierra a las<br><b style="color:var(--text)">${new Date(s.endsAt).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</b>
                </div>
              </div>

              ${already
                ? `<div class="notice" style="margin-top:18px">
                     Asistencia confirmada como <b>${already.status==="present"?"Presente":"Tarde"}</b><br>
                    <span class="muted">${fmtDate(already.checkedAt)}</span>
                   </div>`
                : `<form data-attendance-form="${s.id}" style="margin-top:20px">
                   <label>PIN de esta asistencia</label>
                   <input name="pin" maxlength="4" inputmode="numeric"
                          pattern="[0-9]{4}" autocomplete="one-time-code" placeholder="0000"
                          style="font-size:26px;text-align:center;letter-spacing:.3em">
                   <button class="btn block" style="margin-top:12px" type="submit">
                     Confirmar asistencia
                   </button>
                 </form>`
              }
            </div>`;
          }).join("")}
        </div>`
      : `<div class="empty">
          <div style="font-size:48px;margin-bottom:10px"></div>
          <b>No tienes asistencias activas en este momento.</b><br><br>
          Cuando uno de tus profesores inicie el listado de asistencia de un curso en el que estás matriculado, aparecerá aquí automáticamente.
         </div>`
      }

      <div class="card" style="margin-top:16px">
        <div class="notice">
           El acceso NFC únicamente abre esta plataforma y no determina el curso.
          La materia que aparece aquí depende de la asistencia que el profesor haya activado.
        </div>
      </div>`;

    document.querySelectorAll("[data-attendance-form]").forEach(form=>{
      form.onsubmit=(e)=>{
        e.preventDefault();
        const sessionId=form.dataset.attendanceForm;
        const rawPin=new FormData(form).get("pin");
        checkin(sessionId, rawPin);
      };
    });
  }

  async function checkin(sessionId, rawPin){
    const entered=String(rawPin ?? "").normalize("NFKC").replace(/[^0-9]/g,"");
    if(entered.length!==4) return toast("Ingresa exactamente los 4 dígitos del PIN");

    try{
      const result=await rpc("fet_mark_attendance",{
        p_token:authToken,
        p_session_id:sessionId,
        p_pin:entered
      });
      await refreshFromCloud({renderAfter:false});
      toast(result.status==="present"
        ? "Asistencia confirmada correctamente"
        : "Asistencia confirmada como llegada tarde");
      render();
    }catch(err){
      toast(friendlyError(err));
    }
  }

  function studentHistory(m){
    const recs=db.attendanceRecords.filter(r=>r.studentId===current.id).sort((a,b)=>new Date(b.checkedAt)-new Date(a.checkedAt));
    m.innerHTML=top("Mi historial","Tus registros de asistencia") + `<div class="card">${recs.length?`<table><thead><tr><th>Materia</th><th>Fecha</th><th>Estado</th><th>Método</th></tr></thead><tbody>
      ${recs.map(r=>{const s=byId(db.attendanceSessions,r.sessionId),g=byId(db.groups,s?.groupId);return `<tr><td>${esc(getCourse(g)?.name||"")}</td><td>${fmtDate(r.checkedAt)}</td><td><span class="badge ${r.status}">${r.status==="present"?"Presente":"Tarde"}</span></td><td>${esc(r.method)}</td></tr>`}).join("")}
    </tbody></table>`:`<div class="empty">Aún no tienes asistencias registradas.</div>`}</div>`;
  }

  function modal(content){
    const d=document.createElement("div");d.className="modal";d.id="modal";d.innerHTML=`<div class="modal-card">${content}</div>`;document.body.appendChild(d);
    d.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
    d.onclick=e=>{if(e.target===d)closeModal();};
  }
  function closeModal(){ document.getElementById("modal")?.remove(); }
  function val(id){ return document.getElementById(id)?.value.trim()||""; }

  // Sincronización central: profesor y estudiantes ven los cambios desde dispositivos distintos.
  setInterval(async()=>{
    const typing=document.activeElement && ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName);
    if(authToken && current && !typing){
      await refreshFromCloud({renderAfter:true,silent:true});
    }
  },3000);

  window.FETAsistencias = {
    async actualizar(){
      await refreshFromCloud({renderAfter:true});
    },
    cerrarSesion(){
      logout();
    },
    exportBackup(){
      const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download="fet_asistencia_backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  async function init(){
    if(authToken){
      const ok=await refreshFromCloud({renderAfter:false,silent:true});
      if(ok && current){
        render();
        return;
      }
    }
    renderLogin();
  }

  init();
})();