import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { CalendarEvent } from '../types';

interface CalendarProps {
  events: CalendarEvent[];
  onDateClick?: (date: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export const Calendar: React.FC<CalendarProps> = ({ events, onDateClick, onEventClick, readOnly = false, compact = false }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const renderDays = () => {
    const days = [];
    // Padding for empty cells before first day
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className={`${compact ? 'bg-transparent' : 'h-24 md:h-32 bg-slate-50 border border-slate-100'}`}></div>);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => e.date === dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      days.push(
        <div 
          key={day} 
          onClick={() => onDateClick && onDateClick(dateStr)}
          className={`${compact ? 'aspect-square flex items-center justify-center hover:bg-indigo-100 rounded-lg' : 'h-24 md:h-32 border border-slate-100 p-2'} relative group transition-colors ${(!readOnly || compact) ? 'cursor-pointer' : ''} ${(!compact && !readOnly) ? 'hover:bg-indigo-50' : ''} ${isToday ? 'bg-indigo-50/50' : (compact ? '' : 'bg-white')}`}
        >
          <div className={`flex ${compact ? 'justify-center items-center w-full' : 'justify-between items-start'}`}>
            <span className={`text-sm font-medium flex items-center justify-center rounded-full ${compact ? 'w-8 h-8' : 'w-7 h-7'} ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
              {day}
            </span>
            {!readOnly && !compact && (
               <div className="opacity-0 group-hover:opacity-100 text-xs text-indigo-600 font-bold px-1">+ Add</div>
            )}
          </div>
          
          {!compact && (
            <div className="mt-1 space-y-1 overflow-y-auto max-h-[calc(100%-1.75rem)] custom-scrollbar">
              {dayEvents.map(ev => (
                <div 
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onEventClick && onEventClick(ev); }}
                  className={`text-xs p-1 rounded truncate border-l-2 cursor-pointer
                    ${ev.type === 'CLASS' ? 'bg-blue-50 border-blue-500 text-blue-700' : 
                      ev.type === 'EXAM' ? 'bg-red-50 border-red-500 text-red-700' :
                      ev.type === 'DEADLINE' ? 'bg-orange-50 border-orange-500 text-orange-700' : 
                      'bg-green-50 border-green-500 text-green-700'}`}
                >
                  <div className="font-semibold flex items-center gap-1">
                    {ev.startTime && <span className="opacity-75 text-[10px]">{ev.startTime}</span>}
                    {ev.title}
                  </div>
                </div>
              ))}
            </div>
          )}
          {compact && dayEvents.length > 0 && (
            <div className="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full"></div>
          )}
        </div>
      );
    }
    return days;
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${compact ? 'w-full' : ''}`}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between bg-white border-b border-slate-100">
        <h2 className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-slate-800 flex items-center gap-2`}>
          {!compact && <CalendarIcon className="w-5 h-5 text-indigo-600" />}
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-2">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <ChevronLeft size={compact ? 16 : 20} />
          </button>
          <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
            <ChevronRight size={compact ? 16 : 20} />
          </button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className={`py-2 text-center font-bold text-slate-500 uppercase tracking-wider ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {compact ? day.charAt(0) : day}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid grid-cols-7 ${compact ? 'bg-white p-2 gap-1' : 'bg-slate-100 gap-px border-b border-l border-slate-200'}`}>
        {renderDays()}
      </div>
      
      {!compact && (
        <div className="p-3 bg-slate-50 text-xs text-slate-500 flex gap-4">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Class</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Exam</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Deadline</span>
        </div>
      )}
    </div>
  );
};