import {useEffect, useRef, type ReactNode} from 'react';
import {X} from 'lucide-react';

export default function Modal({title,children,onClose,wide=false}: {title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog=ref.current; if (!dialog) return;
    const previous=document.activeElement as HTMLElement | null;
    dialog.showModal();
    const cancel=(event:Event) => {event.preventDefault();onClose();};
    dialog.addEventListener('cancel',cancel);
    return () => { dialog.removeEventListener('cancel',cancel);dialog.close();previous?.focus(); };
  },[onClose]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} aria-labelledby="modal-title" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal-body"><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={20}/></button></div>{children}</div>
  </dialog>;
}
