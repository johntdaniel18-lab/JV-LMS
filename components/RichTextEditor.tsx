import React, { useState, useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Heading1, Heading2, AlignLeft, AlignCenter, AlignRight, Type } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, className = '' }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value changes to internal content only if not focused (to prevent cursor jumping)
  useEffect(() => {
    if (contentRef.current && document.activeElement !== contentRef.current) {
        if (contentRef.current.innerHTML !== value) {
            contentRef.current.innerHTML = value;
        }
    }
  }, [value]);

  const handleInput = () => {
    if (contentRef.current) {
      onChange(contentRef.current.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    // Get plain text from clipboard
    const text = e.clipboardData.getData('text/plain');
    // Insert text at cursor position, stripping all formatting
    document.execCommand('insertText', false, text);
  };

  const execCmd = (e: React.MouseEvent, command: string, arg: string | undefined = undefined) => {
    e.preventDefault(); // Prevent button click from stealing focus
    document.execCommand(command, false, arg);
    // Ensure focus remains on editor
    if (contentRef.current) {
        contentRef.current.focus();
    }
    handleInput(); 
  };

  const handleNormalText = (e: React.MouseEvent) => {
    e.preventDefault();
    // First remove inline styles (font size, etc) that might make it look like a heading
    document.execCommand('removeFormat', false, undefined);
    // Then convert the block to a paragraph
    document.execCommand('formatBlock', false, 'p');
    
    if (contentRef.current) {
        contentRef.current.focus();
    }
    handleInput();
  };

  return (
    <div className={`border rounded-xl bg-white overflow-hidden flex flex-col ${isFocused ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-300'} ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-slate-50 text-slate-600 select-none">
        <button onMouseDown={(e) => execCmd(e, 'bold')} className="p-1.5 hover:bg-slate-200 rounded" title="Bold"><Bold size={16} /></button>
        <button onMouseDown={(e) => execCmd(e, 'italic')} className="p-1.5 hover:bg-slate-200 rounded" title="Italic"><Italic size={16} /></button>
        <button onMouseDown={(e) => execCmd(e, 'underline')} className="p-1.5 hover:bg-slate-200 rounded" title="Underline"><Underline size={16} /></button>
        
        <div className="w-px h-4 bg-slate-300 mx-1"></div>
        
        <button onMouseDown={(e) => execCmd(e, 'formatBlock', 'h1')} className="p-1.5 hover:bg-slate-200 rounded" title="Heading 1"><Heading1 size={16} /></button>
        <button onMouseDown={(e) => execCmd(e, 'formatBlock', 'h2')} className="p-1.5 hover:bg-slate-200 rounded" title="Heading 2"><Heading2 size={16} /></button>
        <button onMouseDown={handleNormalText} className="p-1.5 hover:bg-slate-200 rounded" title="Normal Text"><Type size={13} /></button>
        
        <div className="w-px h-4 bg-slate-300 mx-1"></div>
        
        <button onMouseDown={(e) => execCmd(e, 'justifyLeft')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Left"><AlignLeft size={16} /></button>
        <button onMouseDown={(e) => execCmd(e, 'justifyCenter')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Center"><AlignCenter size={16} /></button>
        <button onMouseDown={(e) => execCmd(e, 'justifyRight')} className="p-1.5 hover:bg-slate-200 rounded" title="Align Right"><AlignRight size={16} /></button>
      </div>
      
      {/* Content Area */}
      <div className="relative flex-1 min-h-[300px] overflow-hidden cursor-text" onClick={() => contentRef.current?.focus()}>
        <div
          ref={contentRef}
          contentEditable
          className="w-full h-full p-6 outline-none overflow-y-auto prose prose-slate max-w-none text-slate-800 leading-relaxed absolute inset-0"
          onInput={handleInput}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        
        {!value && !isFocused && (
          <div className="absolute top-6 left-6 text-slate-400 pointer-events-none">
              {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};