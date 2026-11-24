/* Owns Inspector state, URL lifetime, viewport gestures and keyboard bindings. */
(function(root){
'use strict';
function create({inspector,inspectorView,stage,chrome,app,sceneStatus,getArtworks,getSelectedIndex,syncSelection,getPreview,schedulePreview,photo}){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
// Dedicated full-resolution viewer. Unlike the wall's cover crop it never crops the image.


const inspectorImage=document.getElementById('inspectorImage');
const inspectorPreview=document.getElementById('inspectorPreview');
const inspectorLoading=document.getElementById('inspectorLoading');
const inspectorPointers=new Map();
let inspectorIndex=-1,inspectorUrl=null,inspectorPreviewUrl=null,inspectorToken=0,inspectorOriginalLoaded=false;
let inspectorNatural={w:1,h:1},inspectorFit=1,inspectorZoom=1,inspectorPan={x:0,y:0},inspectorGesture=null;
let inspectorFocus=null;
function applyInspector(){
 inspectorImage.style.width=`${inspectorNatural.w*inspectorZoom}px`;
 inspectorImage.style.height=`${inspectorNatural.h*inspectorZoom}px`;
 inspectorImage.style.setProperty('--pan-x',`${inspectorPan.x}px`);
 inspectorImage.style.setProperty('--pan-y',`${inspectorPan.y}px`);
 document.getElementById('inspectorScale').textContent=`${Math.round(inspectorZoom*100)}%`;
}
function inspectorFitToView(){
 if(inspector.hidden)return;
 const size=inspectorView.getBoundingClientRect();
 inspectorFit=window.NOEMAInspectorCore.fit(size,inspectorNatural);
 inspectorZoom=inspectorFit;inspectorPan={x:0,y:0};applyInspector();
}
function inspectorZoomAt(target,clientX,clientY){
 if(inspector.hidden)return;
 const bounds=inspectorView.getBoundingClientRect();
 const clamped=clamp(target,Math.min(.12,inspectorFit*.7),Math.max(6,inspectorFit*8));
 const factor=clamped/inspectorZoom;
 const x=clientX-(bounds.left+bounds.width/2),y=clientY-(bounds.top+bounds.height/2);
 inspectorPan=window.NOEMAInspectorCore.zoomPan(inspectorPan,{x,y},factor);
 inspectorZoom=clamped;applyInspector();
}
function clearInspectorPreview(){
 inspectorPreview.hidden=true;inspectorPreview.removeAttribute('src');
 inspectorView.classList.remove('has-preview');
 if(inspectorPreviewUrl){URL.revokeObjectURL(inspectorPreviewUrl);inspectorPreviewUrl=null}
}
function setInspectorPreview(blob,token){
 if(!blob||token!==inspectorToken||inspector.hidden||inspectorOriginalLoaded)return;
 clearInspectorPreview();
 inspectorPreviewUrl=URL.createObjectURL(blob);
 inspectorPreview.src=inspectorPreviewUrl;inspectorPreview.hidden=false;
 inspectorView.classList.add('has-preview');
 inspectorLoading.textContent='预览已显示 · 正在加载完整原图';
}
function loadInspectorIndex(index){
 if(index<0||index>=getArtworks().length)return;
 inspectorIndex=index;const art=getArtworks()[index];
 if(inspectorUrl){URL.revokeObjectURL(inspectorUrl);inspectorUrl=null}
 const token=++inspectorToken;
 inspectorOriginalLoaded=false;clearInspectorPreview();
 inspectorImage.onload=()=>{
  if(token!==inspectorToken||inspector.hidden)return;
  inspectorNatural={w:inspectorImage.naturalWidth||1,h:inspectorImage.naturalHeight||1};
  inspectorOriginalLoaded=true;clearInspectorPreview();inspectorLoading.hidden=true;
  document.getElementById('inspectorMeta').textContent=`${inspectorNatural.w} × ${inspectorNatural.h} PX · ${art.file?((art.file.size/1024/1024).toFixed(1)+' MB'):'NOEMA ARCHIVE'}`;
  inspectorFitToView();
 };
 inspectorImage.onerror=()=>{if(token===inspectorToken){inspectorLoading.hidden=false;inspectorLoading.textContent='无法解码此图像'}};
 inspectorImage.removeAttribute('src');
 inspectorLoading.hidden=false;inspectorLoading.textContent='LOADING IMAGE';
 inspectorImage.alt=art.title;
 document.getElementById('inspectorTitle').textContent=art.title;
 document.getElementById('inspectorCount').textContent=`${index+1} / ${getArtworks().length}`;
 if(art.file){
  // A small image paints immediately while the original decodes.
  if(art.thumbUrl){inspectorPreview.src=art.thumbUrl;inspectorPreview.hidden=false;inspectorView.classList.add('has-preview')}
  const cached=getPreview(art);
  if(cached)setInspectorPreview(cached,token);
  else void schedulePreview(art).then(blob=>setInspectorPreview(blob,token)).catch(()=>{});
  inspectorUrl=URL.createObjectURL(art.file);
  inspectorImage.src=inspectorUrl;
 }else inspectorImage.src=photo(art.img,1800);
 // Keep gallery selection and camera in sync with inspector navigation.
 syncSelection(index);
}
function openInspector(){
 if(!inspector.hidden)return;
 const index=getSelectedIndex();if(index<0)return;
 inspectorFocus=document.activeElement;
 inspector.hidden=false;stage.inert=true;chrome.inert=true;
 loadInspectorIndex(index);
 document.getElementById('inspectorClose').focus({preventScroll:true});
 sceneStatus.textContent='已打开完整原图查看器；按 Escape 返回画布';
}
function closeInspector(){
 if(inspector.hidden)return;
 inspectorToken++;
 inspector.hidden=true;inspectorPointers.clear();inspectorGesture=null;
 inspectorImage.onload=null;inspectorImage.onerror=null;inspectorImage.removeAttribute('src');
 clearInspectorPreview();
 if(inspectorUrl){URL.revokeObjectURL(inspectorUrl);inspectorUrl=null}
 stage.inert=false;chrome.inert=false;
 const target=inspectorFocus?.isConnected?inspectorFocus:document.getElementById('inspectBtn');
 inspectorFocus=null;target.focus({preventScroll:true});sceneStatus.textContent='已返回空间画布';
}
function shiftInspector(step){if(inspectorIndex>=0)loadInspectorIndex((inspectorIndex+step+getArtworks().length)%getArtworks().length)}
inspectorView.addEventListener('wheel',event=>{
 event.preventDefault();inspectorZoomAt(inspectorZoom*Math.exp(-event.deltaY*(event.deltaMode===1?.03:.0014)),event.clientX,event.clientY)
},{passive:false});
inspectorView.addEventListener('dblclick',event=>{event.preventDefault();if(Math.abs(inspectorZoom-1)<.02)inspectorFitToView();else inspectorZoomAt(1,event.clientX,event.clientY)});
function inspectorPinch(){
 const pts=[...inspectorPointers.values()];if(pts.length<2)return null;
 const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
 return{distance:Math.max(1,dist(pts[0],pts[1])),mid,zoom:inspectorZoom,pan:{...inspectorPan}};
}
inspectorView.addEventListener('pointerdown',event=>{
 if(event.button!==0&&event.pointerType==='mouse')return;
 const p={x:event.clientX,y:event.clientY};inspectorPointers.set(event.pointerId,p);
 inspectorView.setPointerCapture(event.pointerId);inspectorView.classList.add('is-panning');
 inspectorGesture=inspectorPointers.size>1?inspectorPinch():null;
});
inspectorView.addEventListener('pointermove',event=>{
 if(!inspectorPointers.has(event.pointerId))return;
 const old=inspectorPointers.get(event.pointerId);const p={x:event.clientX,y:event.clientY};inspectorPointers.set(event.pointerId,p);
 if(inspectorPointers.size>=2){
  if(!inspectorGesture)inspectorGesture=inspectorPinch();
  const pts=[...inspectorPointers.values()];const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
  const rect=inspectorView.getBoundingClientRect();const initial=inspectorGesture;
  const x=initial.mid.x-(rect.left+rect.width/2),y=initial.mid.y-(rect.top+rect.height/2);
  const next=clamp(initial.zoom*dist(pts[0],pts[1])/initial.distance,Math.min(.12,inspectorFit*.7),Math.max(6,inspectorFit*8));
  const ratio=next/initial.zoom;
  inspectorZoom=next;
  inspectorPan.x=mid.x-(rect.left+rect.width/2)-(x-initial.pan.x)*ratio;
  inspectorPan.y=mid.y-(rect.top+rect.height/2)-(y-initial.pan.y)*ratio;
 }else{inspectorPan.x+=p.x-old.x;inspectorPan.y+=p.y-old.y}
 applyInspector();
});
function finishInspectorPointer(event){
 inspectorPointers.delete(event.pointerId);
 inspectorGesture=inspectorPointers.size>=2?inspectorPinch():null;
 if(inspectorPointers.size===0)inspectorView.classList.remove('is-panning');
}
inspectorView.addEventListener('pointerup',finishInspectorPointer);
inspectorView.addEventListener('pointercancel',finishInspectorPointer);
inspectorView.addEventListener('lostpointercapture',finishInspectorPointer);
document.getElementById('inspectBtn').addEventListener('click',openInspector);
document.getElementById('inspectorClose').addEventListener('click',closeInspector);
document.getElementById('inspectorPrev').addEventListener('click',()=>shiftInspector(-1));
document.getElementById('inspectorNext').addEventListener('click',()=>shiftInspector(1));
document.getElementById('inspectorZoomIn').addEventListener('click',()=>inspectorZoomAt(inspectorZoom*1.25,innerWidth/2,innerHeight/2));
document.getElementById('inspectorZoomOut').addEventListener('click',()=>inspectorZoomAt(inspectorZoom/1.25,innerWidth/2,innerHeight/2));
document.getElementById('inspectorActual').addEventListener('click',()=>inspectorZoomAt(1,innerWidth/2,innerHeight/2));
document.getElementById('inspectorFit').addEventListener('click',inspectorFitToView);
window.addEventListener('resize',()=>{if(!inspector.hidden)inspectorFitToView()});
// Capture before global canvas bindings, and keep Tab inside the inspector dialog.
document.addEventListener('keydown',event=>{
 if(inspector.hidden)return;
 const key=event.key.toLowerCase();
 if(event.key==='Tab'){
  if(app.classList.contains('is-immersive')){event.preventDefault();return}
  const controls=[...inspector.querySelectorAll('button')].filter(element=>!element.disabled);
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  return;
 }
 if(event.key==='Escape')closeInspector();
 else if(event.key==='ArrowLeft')shiftInspector(-1);
 else if(event.key==='ArrowRight')shiftInspector(1);
 else if(key==='0')inspectorFitToView();
 else if(key==='1')inspectorZoomAt(1,innerWidth/2,innerHeight/2);
 else if(key==='+'||key==='=')inspectorZoomAt(inspectorZoom*1.2,innerWidth/2,innerHeight/2);
 else if(key==='-')inspectorZoomAt(inspectorZoom/1.2,innerWidth/2,innerHeight/2);
 else return;
 event.preventDefault();event.stopImmediatePropagation();
},true);

return Object.freeze({open:openInspector,close:closeInspector,fit:inspectorFitToView,get index(){return inspectorIndex}});
}
root.NOEMAInspectorController=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
