(async function(){
  'use strict';
  const M=window.GradeNovaMath;
  await window.GradeNovaAccount.ready;
  const $=id=>document.getElementById(id);
  const fmt=n=>n==null?'—':Number(n).toFixed(2);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  const labels={overview:'Overview',calculator:'GPA Calculator',history:'Semester History',planner:'Target Planner',settings:'Settings'};
  let activePage='overview',activeSemesterId='',toastTimer;

  function blankCourse(){return {id:uid(),code:'',title:'',units:3,grade:''};}
  function blankSemester(index=1){return {id:uid(),name:`Semester ${index}`,courses:[blankCourse()]};}
  function emptyWorkspace(){const semester=blankSemester();semester.name='100 Level • First Semester';return {version:1,name:'Student',institution:'Emmanuel Alayande University of Education, Oyo',scale:5,isDemo:false,semesters:[semester]};}
  function safeWorkspace(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.semesters)) throw new Error('Not a GradeNova backup');
    const scale=Number(raw.scale)===4?4:5;
    const semesters=raw.semesters.slice(0,60).map((s,i)=>({
      id:typeof s.id==='string'?s.id.slice(0,80):uid(),
      name:String(s.name||`Semester ${i+1}`).slice(0,70),
      courses:Array.isArray(s.courses)?s.courses.slice(0,200).map(c=>({
        id:typeof c.id==='string'?c.id.slice(0,80):uid(),
        code:String(c.code||'').slice(0,25),title:String(c.title||'').slice(0,90),
        units:Number.isInteger(Number(c.units))&&Number(c.units)>=0&&Number(c.units)<=30?Number(c.units):3,
        grade:typeof c.grade==='string'&&'ABCDEF'.includes(c.grade)?c.grade:''
      })):[]
    }));
    const seen=new Set();
    for(const s of semesters){if(!s.id||seen.has(s.id))s.id=uid();seen.add(s.id);const ids=new Set();for(const c of s.courses){if(!c.id||ids.has(c.id))c.id=uid();ids.add(c.id);if(!(c.grade in M.GRADE_POINTS[scale]))c.grade='';}}
    return {version:1,name:String(raw.name||'Student').slice(0,35),institution:String(raw.institution||'').slice(0,90),scale,isDemo:!!raw.isDemo,semesters};
  }
  function loadState(){return safeWorkspace(window.GradeNovaAccount.getInitial());}
  let state=loadState();activeSemesterId=state.semesters[0]?.id||'';
  function save(){window.GradeNovaAccount.save(state);}
  function current(){return state.semesters.find(s=>s.id===activeSemesterId)||state.semesters[0];}
  function ensureSemester(){if(!state.semesters.length){const s=blankSemester();state.semesters.push(s);activeSemesterId=s.id;save();}else if(!current())activeSemesterId=state.semesters[0].id;}
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300);}
  function trackChange(){save();renderOverview();renderHistory();renderPlanner();renderGradeGuide();}
  function go(page){
    if(!labels[page])page='overview';
    if(page==='calculator'){ensureSemester();renderCalculator();}
    activePage=page;
    document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active-view',el.id===`view-${page}`));
    document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.go===page));
    $('page-crumb').textContent=labels[page];
    if(page==='settings')renderSettings();
    if(page==='planner')renderPlanner();
    window.scrollTo({top:0,behavior:'smooth'});
    if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`);
  }
  function addSemester(){
    const s=blankSemester(state.semesters.length+1);
    state.semesters.push(s);activeSemesterId=s.id;state.isDemo=false;
    trackChange();go('calculator');$('semester-name').focus();$('semester-name').select();toast('New semester added');
  }
  function selectSemester(id){if(!state.semesters.some(s=>s.id===id))return;activeSemesterId=id;renderCalculator();}
  function removeSemester(id){const s=state.semesters.find(x=>x.id===id);if(!s)return;if(!confirm(`Delete “${s.name}” and all of its courses? This cannot be undone.`))return;state.semesters=state.semesters.filter(x=>x.id!==id);if(activeSemesterId===id)activeSemesterId=state.semesters[0]?.id||'';trackChange();toast('Semester deleted');}
  function setScale(next){const scale=Number(next);if(scale===state.scale)return;const eCount=state.semesters.reduce((n,s)=>n+s.courses.filter(c=>c.grade==='E').length,0);if(scale===4&&eCount&&!confirm(`${eCount} E grade(s) are not part of the 4-point scale and will be unselected. Continue?`)){renderSettings();renderCalculator();return;}state.scale=scale;state.isDemo=false;if(scale===4)state.semesters.forEach(s=>s.courses.forEach(c=>{if(c.grade==='E')c.grade='';}));trackChange();renderCalculator();renderSettings();toast(`Switched to ${scale}-point grading`);}
  function renderOverview(){
    const sum=M.calculateOverall(state.semesters,state.scale), max=state.scale;
    const first=state.name.trim().split(/\s+/)[0]||'Student';
    $('welcome-name').textContent=first;
    $('side-name').textContent=state.name||'Student';
    const initials=(state.name||'Student').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()||'ST';
    document.querySelectorAll('.avatar,.top-avatar').forEach(el=>el.textContent=initials);
    $('hero-cgpa').textContent=fmt(sum.cgpa);$('hero-scale').textContent=`OUT OF ${fmt(max)}`;
    $('stat-cgpa').textContent=fmt(sum.cgpa);$('classification-chip').textContent=M.classify(sum.cgpa,max);
    $('scale-foot').textContent=`${max}-point scale`;$('stat-units').innerHTML=`${sum.units}<span class="stat-suffix"> units</span>`;
    $('stat-courses').textContent=sum.courseCount;$('stat-semesters').textContent=state.semesters.length;
    const graded=state.semesters.map((s,i)=>({s,i,result:M.calculateSemester(s,max)})).filter(x=>x.result.units>0);
    if(!graded.length){$('gpa-chart').innerHTML='<div class="chart-empty">Your progress chart will appear here.<br>Add some courses to get started ✧</div>';}
    else{
      const bars=graded.slice(-6).map(x=>{const height=Math.max(3,x.result.gpa/max*100);return `<div class="chart-bar-wrap" title="${esc(x.s.name)}: ${fmt(x.result.gpa)}"><div class="chart-bar" style="height:${height}%"><span>${fmt(x.result.gpa)}</span></div><div class="chart-label">Term ${x.i+1}</div></div>`;}).join('');
      $('gpa-chart').innerHTML=`<div class="axis-labels"><span>${max}</span><span>${(max*.75).toFixed(1)}</span><span>${(max*.5).toFixed(1)}</span><span>${(max*.25).toFixed(1)}</span><span>0</span></div><div class="chart-bars">${bars}</div>`;
    }
    const recent=state.semesters.slice(-3).reverse();
    $('recent-semesters').innerHTML=recent.length?recent.map(s=>{const r=M.calculateSemester(s,max);return `<div class="recent-row"><span class="recent-icon">▤</span><div class="recent-row-main"><strong>${esc(s.name)}</strong><small>${r.courseCount} graded courses · ${r.units} units</small></div><span class="recent-grade">${fmt(r.gpa)}</span></div>`;}).join(''):'<div class="chart-empty">No semester entries yet.</div>';
  }
  function renderCalculator(){
    ensureSemester();const s=current();if(!s)return;
    $('semester-select').innerHTML=state.semesters.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.name)}</option>`).join('');
    $('semester-name').value=s.name;$('calculator-scale').value=String(state.scale);
    $('courses-body').innerHTML=s.courses.map(c=>courseRow(c)).join('');updateTermTotals();
  }
  function gradeOptions(selected){return `<option value="">Select</option>`+Object.entries(M.GRADE_POINTS[state.scale]).map(([grade,points])=>`<option value="${grade}" ${selected===grade?'selected':''}>${grade} (${points})</option>`).join('');}
  function courseRow(c){
    const pts=M.validCourse(c,state.scale)?Number(c.units)*M.GRADE_POINTS[state.scale][c.grade]:null;
    return `<tr data-course-id="${esc(c.id)}"><td><input class="code-input" data-field="code" maxlength="25" value="${esc(c.code)}" placeholder="CSC 101" aria-label="Course code"></td><td><input data-field="title" maxlength="90" value="${esc(c.title)}" placeholder="Introduction to computing" aria-label="Course title"></td><td><input class="units-input" data-field="units" type="number" min="1" max="30" step="1" value="${esc(c.units)}" aria-label="Course units"></td><td><select class="grade-select" data-field="grade" aria-label="Course grade">${gradeOptions(c.grade)}</select></td><td class="point-cell">${pts==null?'—':pts.toFixed(1)}</td><td><button type="button" class="remove-row" data-remove-course="${esc(c.id)}" title="Remove course" aria-label="Remove course">×</button></td></tr>`;
  }
  function updateTermTotals(){const s=current();if(!s)return;const r=M.calculateSemester(s,state.scale);$('term-units').textContent=r.units;$('term-points').textContent=fmt(r.qualityPoints);$('term-gpa').textContent=fmt(r.gpa);}
  function updateCourse(e){const row=e.target.closest('tr[data-course-id]');if(!row)return;const field=e.target.dataset.field;if(!field)return;const c=current()?.courses.find(x=>x.id===row.dataset.courseId);if(!c)return;state.isDemo=false;if(field==='units'){const value=Number(e.target.value);c.units=Number.isInteger(value)&&value>=1&&value<=30?value:0;}else c[field]=e.target.value;if(field==='grade'||field==='code'||field==='units'){const pts=M.validCourse(c,state.scale)?Number(c.units)*M.GRADE_POINTS[state.scale][c.grade]:null;row.querySelector('.point-cell').textContent=pts==null?'—':pts.toFixed(1);}updateTermTotals();trackChange();}
  function renderHistory(){
    const total=M.calculateOverall(state.semesters,state.scale);
    $('history-summary').innerHTML=`<div class="history-stat"><small>Overall CGPA</small><strong>${fmt(total.cgpa)}</strong></div><div class="history-stat"><small>Completed credits</small><strong>${total.units}</strong></div><div class="history-stat"><small>Graded terms</small><strong>${total.gradedSemesters}</strong></div>`;
    $('history-list').innerHTML=state.semesters.length?state.semesters.map((s,i)=>{const r=M.calculateSemester(s,state.scale);return `<article class="history-item"><div class="history-number">${String(i+1).padStart(2,'0')}</div><div class="history-copy"><strong>${esc(s.name)}</strong><small>${r.courseCount} graded courses · ${r.units} credit units · ${fmt(r.qualityPoints)} quality points</small></div><div class="history-gpa"><strong>${fmt(r.gpa)}</strong><small>SEMESTER GPA</small></div><button type="button" class="history-action" data-edit-semester="${esc(s.id)}">Edit</button><button type="button" class="history-action delete" data-delete-semester="${esc(s.id)}">Delete</button></article>`;}).join(''):'<div class="empty-panel"><div class="empty-symbol">✧</div><strong>A blank page, full of potential</strong><p>Add your first semester to begin tracking your academic journey.</p><button type="button" class="button button-gold" id="empty-new-semester">+ Add semester</button></div>';
  }
  function renderGradeGuide(){$('grade-guide').innerHTML=Object.entries(M.GRADE_POINTS[state.scale]).map(([g,p])=>`<div class="grade-badge"><strong>${g}</strong><span>${p} point${p===1?'':'s'}</span></div>`).join('');}
  function renderPlanner(){
    const overall=M.calculateOverall(state.semesters,state.scale);const scale=state.scale;
    $('planner-out-of').textContent=`/ ${fmt(scale)}`;$('required-of').textContent=`out of ${fmt(scale)}`;
    $('target-cgpa').max=String(scale);const goal=$('target-cgpa').value;const next=$('next-units').value;
    const r=M.planTarget(overall,goal,next,scale);
    if(!r){$('required-gpa').textContent='—';$('planner-status').className='planner-status';$('planner-status').textContent=`Enter a target from 0 to ${scale} and a positive number of units.`;$('planner-math').textContent='';return;}
    $('required-gpa').textContent=fmt(Math.max(0,r.requiredDisplay));
    const label=$('planner-status');label.className='planner-status';
    if(r.status==='impossible'){label.classList.add('impossible');label.textContent=`This goal is not reachable in one semester. Even a perfect ${fmt(scale)} GPA would lead to ${fmt(r.best)} CGPA.`;}
    else if(r.status==='already-achieved'){label.classList.add('achieved');label.textContent='Your target remains secure even with a 0.00 GPA in the planned semester.';}
    else{label.textContent=`Aim for at least ${fmt(r.requiredDisplay)} GPA across your next ${r.next} units.`;}
    $('planner-math').textContent=`Current: ${overall.units} units · ${fmt(overall.cgpa)} CGPA · Target: ${fmt(r.goal)}`;
  }
  function renderSettings(){$('student-name').value=state.name;$('institution-name').value=state.institution;$('settings-scale').value=String(state.scale);}
  function renderAll(){renderOverview();renderCalculator();renderHistory();renderGradeGuide();renderPlanner();renderSettings();save();}
  function exportJSON(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});download(blob,'GradeNova-backup.json');toast('Backup downloaded');}
  function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function demoWorkspace(){
    function term(name,courses){return {id:uid(),name,courses:courses.map(([code,title,units,grade])=>({id:uid(),code,title,units,grade}))};}
    return {version:1,name:'Student',institution:'Emmanuel Alayande University of Education, Oyo',scale:5,isDemo:true,semesters:[
      term('100 Level • First Semester', [['MTH 101','Elementary Mathematics I',3,'A'],['CSC 101','Introduction to Computing',3,'A'],['GST 111','Communication in English',2,'B'],['PHY 101','General Physics I',3,'B'],['STA 111','Descriptive Statistics',2,'A']]),
      term('100 Level • Second Semester',[['MTH 102','Elementary Mathematics II',3,'A'],['CSC 102','Programming Fundamentals',3,'B'],['GST 112','Communication Skills II',2,'A'],['EDU 102','Foundations of Education',2,'B'],['PHY 102','General Physics II',3,'C']])
    ]};
  }
  function preparePrint(){
    const overall=M.calculateOverall(state.semesters,state.scale);
    const sections=state.semesters.map(s=>{const r=M.calculateSemester(s,state.scale);const rows=s.courses.filter(c=>M.validCourse(c,state.scale)).map(c=>`<tr><td>${esc(c.code)}</td><td>${esc(c.title)}</td><td>${c.units}</td><td>${c.grade}</td><td>${M.GRADE_POINTS[state.scale][c.grade]*c.units}</td></tr>`).join('');return `<h2>${esc(s.name)} · GPA ${fmt(r.gpa)}</h2><table><thead><tr><th>Code</th><th>Title</th><th>Units</th><th>Grade</th><th>Quality points</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No graded courses</td></tr>'}</tbody></table><p>Semester credits: ${r.units} · Quality points: ${fmt(r.qualityPoints)}</p>`;}).join('');
    $('print-report').innerHTML=`<h1>GradeNova — Academic Report</h1><p><strong>Student:</strong> ${esc(state.name)}</p><p><strong>Institution:</strong> ${esc(state.institution)}</p><p><strong>Grading scale:</strong> ${state.scale}-point</p><p><strong>Overall CGPA:</strong> ${fmt(overall.cgpa)} · <strong>Graded credits:</strong> ${overall.units} · <strong>Class estimate:</strong> ${M.classify(overall.cgpa,state.scale)}</p>${sections}<p class="print-note">Unofficial self-reported GradeNova report. Grades, scale and classification are subject to your institution's official rules. Generated ${new Date().toLocaleDateString()}.</p>`;
  }
  function init(){
    const localImport=document.createElement('button');
    localImport.type='button';localImport.className='settings-action';localImport.textContent='Import records saved in this browser';
    $('export-json').parentElement.appendChild(localImport);
    localImport.onclick=()=>{try{const raw=localStorage.getItem('gradenova_workspace_v1');if(!raw){toast('No previous local records found in this browser');return;}const next=safeWorkspace(JSON.parse(raw));if(!confirm('Replace account records with the records previously saved in this browser?'))return;state=next;activeSemesterId=state.semesters[0]?.id||'';renderAll();toast('Local records imported; check the save status');}catch{toast('Could not read the local records');}};
    $('footer-year').textContent=String(new Date().getFullYear());
    document.addEventListener('click',e=>{
      const nav=e.target.closest('[data-go]');if(nav){go(nav.dataset.go);return;}
      const edit=e.target.closest('[data-edit-semester]');if(edit){selectSemester(edit.dataset.editSemester);go('calculator');return;}
      const del=e.target.closest('[data-delete-semester]');if(del){removeSemester(del.dataset.deleteSemester);return;}
      const rem=e.target.closest('[data-remove-course]');if(rem){const s=current();if(!s)return;s.courses=s.courses.filter(c=>c.id!==rem.dataset.removeCourse);renderCalculator();trackChange();}
    });
    $('new-semester-overview').addEventListener('click',addSemester);
    $('add-semester-calculator').addEventListener('click',addSemester);
    $('add-semester-history').addEventListener('click',addSemester);
    $('history-list').addEventListener('click',e=>{if(e.target.id==='empty-new-semester')addSemester();});
    $('add-course').addEventListener('click',()=>{ensureSemester();current().courses.push(blankCourse());renderCalculator();trackChange();const inputs=$('courses-body').querySelectorAll('[data-field="code"]');inputs[inputs.length-1]?.focus();});
    $('semester-select').addEventListener('change',e=>selectSemester(e.target.value));
    $('semester-name').addEventListener('input',e=>{const s=current();if(!s)return;s.name=e.target.value;state.isDemo=false;trackChange();const option=$('semester-select').selectedOptions[0];if(option)option.textContent=s.name||'Untitled semester';});
    $('calculator-scale').addEventListener('change',e=>setScale(e.target.value));
    $('settings-scale').addEventListener('change',e=>setScale(e.target.value));
    $('courses-body').addEventListener('input',updateCourse);
    $('courses-body').addEventListener('change',updateCourse);
    for(const id of ['target-cgpa','next-units'])$(id).addEventListener('input',renderPlanner);
    $('student-name').addEventListener('input',e=>{state.name=e.target.value||'Student';trackChange();});
    $('institution-name').addEventListener('input',e=>{state.institution=e.target.value;save();});
    $('export-json').addEventListener('click',exportJSON);
    $('export-report').addEventListener('click',exportJSON);
    $('print-button').addEventListener('click',()=>{preparePrint();window.print();});
    $('load-demo').addEventListener('click',()=>{if(M.calculateOverall(state.semesters,state.scale).courseCount&&!confirm('Replace current entries with sample data? Download a backup first if you need them.'))return;state=demoWorkspace();activeSemesterId=state.semesters[0].id;renderAll();go('overview');toast('Sample academic records loaded');});
    $('reset-all').addEventListener('click',()=>{if(!confirm('Clear all courses and semesters on this device? This cannot be undone.'))return;state=emptyWorkspace();activeSemesterId=state.semesters[0].id;renderAll();go('overview');toast('Your workspace is ready for a fresh start');});
    $('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('File is too large');const next=safeWorkspace(JSON.parse(await file.text()));if(!confirm('Replace all current records with this backup?'))return;state=next;activeSemesterId=state.semesters[0]?.id||'';renderAll();go('overview');toast('Backup restored successfully');}catch(err){toast('This file is not a valid GradeNova backup');}finally{e.target.value='';}});
    document.querySelector('label[for="import-file"]').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('import-file').click();}});
    renderAll();const initial=location.hash.replace('#','');go(labels[initial]?initial:'overview');
    window.addEventListener('hashchange',()=>{const next=location.hash.replace('#','');if(labels[next]&&next!==activePage)go(next);});
  }
  init();
})();
