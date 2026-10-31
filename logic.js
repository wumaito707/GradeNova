(function(root){
  'use strict';
  const GRADE_POINTS = Object.freeze({
    5: Object.freeze({A:5,B:4,C:3,D:2,E:1,F:0}),
    4: Object.freeze({A:4,B:3,C:2,D:1,F:0})
  });
  function validCourse(course, scale) {
    if (!course || typeof course !== 'object') return false;
    const units = Number(course.units);
    return !!String(course.code || '').trim() && Number.isInteger(units) && units >= 1 && units <= 30 &&
      Object.prototype.hasOwnProperty.call(GRADE_POINTS[scale] || GRADE_POINTS[5], course.grade);
  }
  function calculateSemester(semester, scale=5) {
    const entries = (semester?.courses || []).filter(c => validCourse(c,scale));
    const units = entries.reduce((sum,c) => sum + Number(c.units),0);
    const qualityPoints = entries.reduce((sum,c) => sum + Number(c.units)*GRADE_POINTS[scale][c.grade],0);
    return {units, qualityPoints, gpa:units ? qualityPoints/units : null, courseCount:entries.length};
  }
  function calculateOverall(semesters,scale=5) {
    const results=(semesters || []).map(s => calculateSemester(s,scale));
    const units=results.reduce((sum,r)=>sum+r.units,0);
    const qualityPoints=results.reduce((sum,r)=>sum+r.qualityPoints,0);
    return {units,qualityPoints,cgpa:units?qualityPoints/units:null,courseCount:results.reduce((sum,r)=>sum+r.courseCount,0),gradedSemesters:results.filter(r=>r.units>0).length};
  }
  function classify(cgpa,scale=5){
    if(cgpa==null || !Number.isFinite(cgpa)) return 'No grades yet';
    const thresholds=scale===4?[[3.5,'First Class'],[3,'Second Class Upper'],[2,'Second Class Lower'],[1,'Third Class'],[0,'Below Third Class']]:[[4.5,'First Class'],[3.5,'Second Class Upper'],[2.4,'Second Class Lower'],[1.5,'Third Class'],[1,'Pass'],[0,'Below Pass']];
    return thresholds.find(([min])=>cgpa+1e-9>=min)?.[1] || 'Below Pass';
  }
  function planTarget(overall,target,futureUnits,scale=5){
    if(target==null||futureUnits==null||String(target).trim()===''||String(futureUnits).trim()==='')return null;
    const goal=Number(target),next=Number(futureUnits);
    if(!Number.isFinite(goal)||goal<0||goal>scale||!Number.isInteger(next)||next<1||next>100) return null;
    const required=(goal*(overall.units+next)-overall.qualityPoints)/next;
    const status=required>scale+1e-9?'impossible':required<=0?'already-achieved':'reachable';
    const best=(overall.qualityPoints+next*scale)/(overall.units+next);
    return {required,requiredDisplay:Math.ceil((required-1e-9)*100)/100,status,best,goal,next};
  }
  const api={GRADE_POINTS,validCourse,calculateSemester,calculateOverall,classify,planTarget};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GradeNovaMath=api;
})(typeof window!=='undefined'?window:globalThis);
