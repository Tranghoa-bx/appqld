import React, { useState, useEffect } from 'react';
import { 
  Users, 
  GraduationCap, 
  Settings as SettingsIcon, 
  BarChart3, 
  PlusCircle, 
  MinusCircle, 
  Save, 
  Download, 
  Upload, 
  BrainCircuit,
  Trash2,
  Plus,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertCircle,
  History,
  Clock,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { marked } from 'marked';
import { INITIAL_DATA } from './constants';
import { AppData, SCORE_WEIGHTS, Grade, Student } from './types';
import { callGeminiAI, PROMPTS } from './lib/gemini';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// --- Cài đặt tiện ích ---
const calculateAverage = (grade: Grade) => {
  const { oral, m15, h1, semester } = grade;
  
  if (oral.length === 0 && m15.length === 0 && h1.length === 0 && semester === null) return 0;

  let totalScore = 0;
  let totalWeight = 0;

  // Tính tổng Miệng & 15P (hệ số 1)
  oral.forEach(s => { totalScore += s; totalWeight += 1; });
  m15.forEach(s => { totalScore += s; totalWeight += 1; });

  // Tính tổng Giữa kỳ (hệ số 2)
  h1.forEach(s => { totalScore += s * 2; totalWeight += 2; });
  
  // Tính tổng Cuối kỳ (hệ số 3)
  if (semester !== null) {
    totalScore += semester * 3;
    totalWeight += 3;
  }

  if (totalWeight === 0) return 0;
  
  const avg = totalScore / totalWeight;
  return Math.min(10, Math.max(0, Math.round(avg * 10) / 10));
};

const getRank = (avg: number) => {
  if (avg >= 8.0) return { label: 'Giỏi', color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (avg >= 6.5) return { label: 'Khá', color: 'text-blue-600', bg: 'bg-blue-100' };
  if (avg >= 5.0) return { label: 'Trung bình', color: 'text-amber-600', bg: 'bg-amber-100' };
  return { label: 'Yếu', color: 'text-rose-600', bg: 'bg-rose-100' };
};

export default function App() {
  const [data, setData] = useState<AppData>(() => {
    const saved = localStorage.getItem('smartgrade_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...INITIAL_DATA, ...parsed, settings: { ...INITIAL_DATA.settings, ...(parsed.settings || {}) } };
    }
    return INITIAL_DATA;
  });
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'grading' | 'settings' | 'history'>('dashboard');
  const [selectedClassId, setSelectedClassId] = useState<string>(data.classes[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');

  useEffect(() => {
    localStorage.setItem('smartgrade_data', JSON.stringify(data));
  }, [data]);

  const recordHistory = (studentId: string, type: any, oldVal: any, newVal: any) => {
    const record = {
      id: Math.random().toString(36).substr(2, 9),
      studentId,
      timestamp: new Date().toISOString(),
      type,
      oldValue: String(oldVal),
      newValue: String(newVal)
    };
    setData(prev => ({
      ...prev,
      history: [record, ...prev.history].slice(0, 1000)
    }));
  };

  const activeClass = data.classes.find(c => c.id === selectedClassId);
  const classStudents = data.students[selectedClassId] || [];
  const classGrades = data.grades[selectedClassId] || [];

  const handleUpdateGrade = (studentId: string, field: keyof Grade, value: any) => {
     const grade = classGrades.find(g => g.studentId === studentId);
     if (!grade) return;

     const fieldMap: Record<string, any> = {
       oral: 'Miệng',
       m15: '15 Phút',
       h1: 'Giữa Kỳ',
       semester: 'Cuối Kỳ'
     };

     const oldVal = grade[field];
     recordHistory(studentId, fieldMap[field as string] || field, Array.isArray(oldVal) ? `[${oldVal.join(', ')}]` : oldVal === null ? 'Trống' : oldVal, Array.isArray(value) ? `[${value.join(', ')}]` : value);

    setData(prev => {
      const newGrades = [...prev.grades[selectedClassId]];
      const index = newGrades.findIndex(g => g.studentId === studentId);
      if (index !== -1) {
        newGrades[index] = { ...newGrades[index], [field]: value };
      }
      return {
        ...prev,
        grades: { ...prev.grades, [selectedClassId]: newGrades }
      };
    });
  };

  const updateBonus = (studentId: string, amount: number) => {
    setData(prev => {
      const newGrades = [...prev.grades[selectedClassId]];
      const index = newGrades.findIndex(g => g.studentId === studentId);
      if (index === -1) return prev;

      const oldVal = newGrades[index].bonusTotal || 0;
      const newVal = Math.max(0, oldVal + amount);

      if (oldVal !== newVal) {
        const record = {
          id: Math.random().toString(36).substr(2, 9),
          studentId,
          timestamp: new Date().toISOString(),
          type: 'Cộng' as const,
          oldValue: String(oldVal),
          newValue: String(newVal)
        };
        return {
          ...prev,
          grades: { 
            ...prev.grades, 
            [selectedClassId]: newGrades.map((g, i) => i === index ? { ...g, bonusTotal: newVal } : g) 
          },
          history: [record, ...prev.history].slice(0, 1000)
        };
      }
      return prev;
    });
  };

  const updatePenalty = (studentId: string, amount: number) => {
    setData(prev => {
      const newGrades = [...prev.grades[selectedClassId]];
      const index = newGrades.findIndex(g => g.studentId === studentId);
      if (index !== -1) {
        const oldVal = newGrades[index].penaltyTotal || 0;
        const newVal = Math.max(0, oldVal + amount);

        if (oldVal !== newVal) {
          const record = {
            id: Math.random().toString(36).substr(2, 9),
            studentId,
            timestamp: new Date().toISOString(),
            type: 'Trừ',
            oldValue: String(oldVal),
            newValue: String(newVal)
          };
          return {
            ...prev,
            grades: { ...prev.grades, [selectedClassId]: newGrades.map((g, i) => i === index ? { ...g, penaltyTotal: newVal } : g) },
            history: [record, ...prev.history].slice(0, 1000)
          };
        }
      }
      return prev;
    });
  };

  const exportExcel = () => {
    if (!activeClass) return;
    const exportData = classStudents.map(s => {
      const g = classGrades.find(grade => grade.studentId === s.id);
      const avg = g ? calculateAverage(g) : 0;
      return {
        'Họ và Tên': s.name,
        'Giới tính': s.gender,
        'Đ. Cộng (+)': g?.bonusTotal || 0,
        'Đ. Trừ (-)': g?.penaltyTotal || 0,
        'ĐTB': avg,
        'Xếp loại': getRank(avg).label
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeClass.name);
    XLSX.writeFile(wb, `${activeClass.name}_DiemSo.xlsx`);
    Swal.fire('Thành công', 'Đã xuất file Excel!', 'success');
  };

  const importExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeClass || !e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json<any>(ws);

        if (rows.length === 0) {
          Swal.fire('Lỗi', 'File Excel không có dữ liệu', 'error');
          return;
        }

        const newStudents: Student[] = [];
        const newGrades: Grade[] = [];

        rows.forEach((row, index) => {
          const name = row['Họ và Tên'] || row['Họ tên'] || row['Name'] || row['Họ Và Tên'];
          if (!name) return;

          const studentId = `s_${Date.now()}_${index}`;
          const gender = String(row['Giới tính'] || row['Gender'] || '').toLowerCase() === 'nữ' ? 'Nữ' : 'Nam';

          newStudents.push({ id: studentId, name: String(name), gender });
          newGrades.push({ studentId, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 });
        });

        if (newStudents.length > 0) {
          setData(prev => ({
            ...prev,
            students: { ...prev.students, [selectedClassId]: [...(prev.students[selectedClassId] || []), ...newStudents] },
            grades: { ...prev.grades, [selectedClassId]: [...(prev.grades[selectedClassId] || []), ...newGrades] }
          }));
          Swal.fire('Thành công', `Đã nhập ${newStudents.length} học sinh!`, 'success');
        } else {
          Swal.fire('Lỗi', 'Không tìm thấy cột "Họ và Tên" trong file', 'error');
        }
      } catch (err) {
        Swal.fire('Lỗi', 'Đã xảy ra lỗi khi đọc file Excel', 'error');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleCloseMonth = () => {
    if (!activeClass || classStudents.length === 0) return;
    
    Swal.fire({
      title: 'Bạn muốn reset điểm cộng/trừ của chu kỳ hiện tại?',
      html: `
        <div class="text-left text-sm mb-4">
          <p class="font-bold text-rose-600 mb-2">Lưu lại tất cả các lịch sử</p>
          <p>Dữ liệu hiện tại gồm:</p>
          <ul class="list-disc ml-5 mt-1 text-slate-700">
            <li>Tổng điểm cộng</li>
            <li>Tổng điểm trừ</li>
            <li>Điểm ròng</li>
            <li>Lịch sử cộng/trừ trong chu kỳ</li>
          </ul>
          <p class="mt-3 font-semibold">Vui lòng chọn cách xử lý:</p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Chốt sớm và reset',
      denyButtonText: 'Xóa dữ liệu nháp',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#4f46e5',
      denyButtonColor: '#ef4444',
      customClass: {
        actions: 'flex-col sm:flex-row gap-2',
        confirmButton: 'order-1 w-full sm:w-auto',
        denyButton: 'order-2 w-full sm:w-auto',
        cancelButton: 'order-3 w-full sm:w-auto'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const currentMonth = dayjs().format('MM/YYYY');
        const timestamp = dayjs().toISOString();
        
        setData(prev => {
          const newGrades = prev.grades[selectedClassId].map(grade => {
            const net = (grade.bonusTotal || 0) - (grade.penaltyTotal || 0);
            let suggestion = 'Bình thường';
            if (net >= 2) suggestion = 'Tuyên dương';
            else if (net > 0) suggestion = 'Khen ngợi';
            else if (net <= -2) suggestion = 'Cảnh cáo';
            else if (net < 0) suggestion = 'Cần cố gắng';
            
            const newRecord = {
              month: `Tháng ${currentMonth}`,
              bonus: grade.bonusTotal || 0,
              penalty: grade.penaltyTotal || 0,
              net,
              suggestion,
              timestamp
            };
            
            return {
              ...grade,
              bonusTotal: 0,
              penaltyTotal: 0,
              monthlyHistory: [...(grade.monthlyHistory || []), newRecord]
            };
          });
          
          return {
            ...prev,
            grades: { ...prev.grades, [selectedClassId]: newGrades }
          };
        });
        Swal.fire('Thành công', 'Đã chốt kỳ và lưu lịch sử!', 'success');
      } else if (result.isDenied) {
        setData(prev => {
          const newGrades = prev.grades[selectedClassId].map(grade => ({
            ...grade,
            bonusTotal: 0,
            penaltyTotal: 0
          }));
          return { ...prev, grades: { ...prev.grades, [selectedClassId]: newGrades } };
        });
        Swal.fire('Đã xóa', 'Dữ liệu nháp đã được reset về 0.', 'info');
      }
    });
  };

  const handleAiAnalyze = async (student: Student) => {
    const grade = classGrades.find(g => g.studentId === student.id);
    if (!grade) return;

    setIsAiLoading(true);
    const prompt = PROMPTS.analyzeStudent(student.name, {
      ...grade,
      average: calculateAverage(grade)
    });

    try {
      const res = await callGeminiAI(prompt);
      if (res) {
        setAiResponse(res);
        Swal.fire({
          title: `Phân tích AI: ${student.name}`,
          html: `<div class="text-left max-h-[60vh] overflow-y-auto prose prose-sm">${marked.parse(res)}</div>`,
          width: '800px',
          confirmButtonText: 'Đã hiểu'
        });
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- Thống kê ---
  const stats = {
    total: classStudents.length,
    gioi: classGrades.filter(g => calculateAverage(g) >= 8.0).length,
    kha: classGrades.filter(g => { const a = calculateAverage(g); return a >= 6.5 && a < 8.0; }).length,
    tb: classGrades.filter(g => { const a = calculateAverage(g); return a >= 5.0 && a < 6.5; }).length,
    yeu: classGrades.filter(g => calculateAverage(g) < 5.0).length,
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <nav className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col z-20">
        <div className="p-6 gradient-bg text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <GraduationCap size={28} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">SmartGrade</h1>
              <p className="text-xs opacity-80 font-medium">Hệ thống quản lý THCS</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Menu chính</p>
            <div className="space-y-1">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <BarChart3 size={20} />
                <span>Tổng quan</span>
              </button>
              <button 
                onClick={() => setActiveTab('grading')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'grading' ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Users size={20} />
                <span>Sổ điểm lớp</span>
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <History size={20} />
                <span>Lịch sử thay đổi</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Danh sách lớp</p>
              <button 
                onClick={() => {
                  Swal.fire({
                    title: 'Thêm lớp học mới',
                    html: `
                      <input id="swal-class-name" class="swal2-input" placeholder="Tên lớp (VD: 9A1)">
                      <input id="swal-class-subject" class="swal2-input" placeholder="Môn học (VD: Toán học)">
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Thêm lớp',
                    cancelButtonText: 'Hủy',
                    preConfirm: () => {
                      const name = (document.getElementById('swal-class-name') as HTMLInputElement).value;
                      const subject = (document.getElementById('swal-class-subject') as HTMLInputElement).value;
                      if (!name || !subject) {
                        Swal.showValidationMessage('Vui lòng nhập đầy đủ tên lớp và môn học');
                      }
                      return { name, subject };
                    }
                  }).then((result) => {
                    if (result.isConfirmed) {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setData(prev => ({
                        ...prev,
                        classes: [...prev.classes, { id: newId, name: result.value.name, subject: result.value.subject }],
                        students: { ...prev.students, [newId]: [] },
                        grades: { ...prev.grades, [newId]: [] }
                      }));
                      setSelectedClassId(newId);
                      setActiveTab('grading');
                    }
                  });
                }}
                className="text-blue-500 hover:bg-blue-50 p-1 rounded transition-colors"
                title="Thêm lớp"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {data.classes.map(cls => (
                <div key={cls.id} className="relative group">
                  <button
                    onClick={() => { setSelectedClassId(cls.id); setActiveTab('grading'); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-all pr-8 ${selectedClassId === cls.id ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${selectedClassId === cls.id ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                      <span className="truncate max-w-[80px]">{cls.name}</span>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md truncate max-w-[60px]">{cls.subject}</span>
                  </button>
                  {selectedClassId === cls.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        Swal.fire({
                          title: 'Chỉnh sửa lớp học',
                          html: `
                            <input id="swal-edit-name" class="swal2-input" value="${cls.name}" placeholder="Tên lớp">
                            <input id="swal-edit-subject" class="swal2-input" value="${cls.subject}" placeholder="Môn học">
                          `,
                          showCancelButton: true,
                          showDenyButton: true,
                          confirmButtonText: 'Lưu',
                          denyButtonText: 'Xóa lớp',
                          cancelButtonText: 'Hủy',
                          denyButtonColor: '#ef4444',
                          preConfirm: () => {
                            const name = (document.getElementById('swal-edit-name') as HTMLInputElement).value;
                            const subject = (document.getElementById('swal-edit-subject') as HTMLInputElement).value;
                            if (!name || !subject) Swal.showValidationMessage('Vui lòng nhập đầy đủ');
                            return { name, subject };
                          }
                        }).then((result) => {
                          if (result.isConfirmed) {
                            setData(prev => ({
                              ...prev,
                              classes: prev.classes.map(c => c.id === cls.id ? { ...c, name: result.value.name, subject: result.value.subject } : c)
                            }));
                          } else if (result.isDenied) {
                            Swal.fire({
                              title: 'Xóa lớp học?',
                              text: 'Toàn bộ học sinh và điểm số của lớp này sẽ bị xóa!',
                              icon: 'warning',
                              showCancelButton: true,
                              confirmButtonText: 'Đồng ý xóa',
                              cancelButtonText: 'Hủy',
                              confirmButtonColor: '#ef4444'
                            }).then(delRes => {
                              if (delRes.isConfirmed) {
                                setData(prev => {
                                  const newClasses = prev.classes.filter(c => c.id !== cls.id);
                                  const newStudents = { ...prev.students };
                                  delete newStudents[cls.id];
                                  const newGrades = { ...prev.grades };
                                  delete newGrades[cls.id];
                                  return { ...prev, classes: newClasses, students: newStudents, grades: newGrades };
                                });
                                setSelectedClassId(data.classes.find(c => c.id !== cls.id)?.id || '');
                              }
                            });
                          }
                        });
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 rounded transition-colors"
                      title="Sửa/Xóa lớp"
                    >
                      <SettingsIcon size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100">
           <button 
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <SettingsIcon size={20} />
                <span>Cài đặt hệ thống</span>
              </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {activeTab === 'dashboard' ? 'Báo cáo tổng quan' : activeTab === 'grading' ? `Sổ điểm: ${activeClass?.name}` : activeTab === 'history' ? 'Lịch sử thay đổi' : 'Cài đặt'}
            </h2>
            <p className="text-slate-500 text-sm">Chào mừng, giáo viên! Hôm nay là {dayjs().format('DD/MM/YYYY')}</p>
          </div>
          
          <div className="flex items-center gap-3">
            {!data.settings.geminiApiKey && (
              <button 
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2.5 rounded-xl text-sm font-bold border border-rose-200 hover:bg-rose-100 transition-all shadow-sm animate-pulse whitespace-nowrap"
              >
                <AlertCircle size={18} />
                <span className="hidden sm:inline">Lấy API key để sử dụng app</span>
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Tìm học sinh..." 
                className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {activeTab === 'grading' && (
              <>
                <button onClick={handleCloseMonth} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <CalendarCheck size={18} />
                  <span className="hidden sm:inline">Chốt kỳ</span>
                </button>
                <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md cursor-pointer">
                  <Upload size={18} />
                  <span className="hidden sm:inline">Nhập Excel</span>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importExcel} />
                </label>
                <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <Download size={18} />
                  <span className="hidden sm:inline">Xuất Excel</span>
                </button>
              </>
            )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'grading' && (
            <motion.div 
              key="grading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Quick Filters/Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Tổng học sinh</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow border-l-4 border-l-emerald-500">
                  <p className="text-xs font-semibold text-emerald-600 uppercase mb-1">Giỏi (≥ 8.0)</p>
                  <p className="text-2xl font-bold text-emerald-700">{stats.gioi}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow border-l-4 border-l-blue-500">
                  <p className="text-xs font-semibold text-blue-600 uppercase mb-1">Khá (≥ 6.5)</p>
                  <p className="text-2xl font-bold text-blue-700">{stats.kha}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow border-l-4 border-l-rose-500">
                  <p className="text-xs font-semibold text-rose-600 uppercase mb-1">Yếu (&lt; 5.0)</p>
                  <p className="text-2xl font-bold text-rose-700">{stats.yeu}</p>
                </div>
              </div>

              {/* Table Container */}
              <div className="bg-white rounded-2xl border border-slate-200 card-shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Họ và Tên</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Miệng</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">15 Phút</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Giữa Kỳ (x2)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Cuối Kỳ (x3)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-emerald-600 bg-emerald-50/30">Cộng (+)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-rose-600 bg-rose-50/30">Trừ (-)</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-indigo-600 bg-indigo-50/30">Ròng</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center font-bold text-blue-600 bg-blue-50/30">ĐTB</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classStudents.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((student) => {
                        const grade = classGrades.find(g => g.studentId === student.id);
                        if (!grade) return null;
                        const avg = calculateAverage(grade);
                        const rank = getRank(avg);

                        return (
                          <motion.tr layout key={student.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${student.gender === 'Nam' ? 'bg-blue-400' : 'bg-rose-400'}`}>
                                  {student.name.charAt(0)}
                                </div>
                                <div className="leading-none cursor-pointer group" onClick={() => {
                                  Swal.fire({
                                    title: 'Sửa thông tin học sinh',
                                    html: `
                                      <input id="swal-student-name" class="swal2-input" value="${student.name}" placeholder="Tên học sinh">
                                      <select id="swal-student-gender" class="swal2-select">
                                        <option value="Nam" ${student.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                                        <option value="Nữ" ${student.gender === 'Nữ' ? 'selected' : ''}>Nữ</option>
                                      </select>
                                    `,
                                    showCancelButton: true,
                                    confirmButtonText: 'Lưu',
                                    cancelButtonText: 'Hủy',
                                    preConfirm: () => {
                                      const name = (document.getElementById('swal-student-name') as HTMLInputElement).value;
                                      const gender = (document.getElementById('swal-student-gender') as HTMLSelectElement).value as 'Nam' | 'Nữ';
                                      if (!name) Swal.showValidationMessage('Vui lòng nhập tên học sinh');
                                      return { name, gender };
                                    }
                                  }).then((res) => {
                                    if (res.isConfirmed) {
                                      setData(prev => {
                                        const newStudents = [...(prev.students[selectedClassId] || [])];
                                        const idx = newStudents.findIndex(s => s.id === student.id);
                                        if (idx !== -1) newStudents[idx] = { ...newStudents[idx], name: res.value.name, gender: res.value.gender };
                                        return { ...prev, students: { ...prev.students, [selectedClassId]: newStudents } };
                                      });
                                    }
                                  });
                                }}>
                                  <p className="font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1">
                                    {student.name} <SettingsIcon size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider mt-1 inline-block ${rank.bg} ${rank.color}`}>
                                    {rank.label}
                                  </span>
                                </div>
                              </div>
                            </td>
                            {/* Điểm Miệng */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-wrap justify-center gap-1 min-w-[80px]">
                                {grade.oral.map((s, idx) => (
                                  <button 
                                    key={idx} 
                                    onClick={() => {
                                      Swal.fire({
                                        title: 'Chỉnh sửa điểm Miệng',
                                        input: 'number',
                                        inputValue: s,
                                        inputAttributes: { min: '0', max: '10', step: '0.1' },
                                        showDenyButton: true,
                                        showCancelButton: true,
                                        confirmButtonText: 'Cập nhật',
                                        denyButtonText: 'Xóa điểm',
                                        denyButtonColor: '#ef4444',
                                        cancelButtonText: 'Hủy'
                                      }).then(result => {
                                        if (result.isConfirmed) {
                                          const newVal = parseFloat(result.value);
                                          const newArr = [...grade.oral];
                                          newArr[idx] = newVal;
                                          handleUpdateGrade(student.id, 'oral', newArr);
                                        } else if (result.isDenied) {
                                          const newArr = grade.oral.filter((_, i) => i !== idx);
                                          handleUpdateGrade(student.id, 'oral', newArr);
                                        }
                                      });
                                    }}
                                    className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-bold border border-slate-200 hover:bg-white hover:shadow-sm transition-all"
                                  >
                                    {s}
                                  </button>
                                ))}
                                <button 
                                  onClick={() => {
                                    Swal.fire({
                                      title: 'Thêm điểm miệng',
                                      input: 'number',
                                      inputAttributes: { min: '0', max: '10', step: '0.1' },
                                      showCancelButton: true
                                    }).then(result => {
                                      if (result.isConfirmed) handleUpdateGrade(student.id, 'oral', [...grade.oral, parseFloat(result.value)]);
                                    });
                                  }} 
                                  className="text-blue-500 hover:text-blue-700"
                                >
                                  <PlusCircle size={14} />
                                </button>
                              </div>
                            </td>
                            {/* Điểm 15P */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-wrap justify-center gap-1 min-w-[80px]">
                                {grade.m15.map((s, idx) => (
                                  <button 
                                    key={idx} 
                                    onClick={() => {
                                      Swal.fire({
                                        title: 'Chỉnh sửa điểm 15 Phút',
                                        input: 'number',
                                        inputValue: s,
                                        inputAttributes: { min: '0', max: '10', step: '0.1' },
                                        showDenyButton: true,
                                        showCancelButton: true,
                                        confirmButtonText: 'Cập nhật',
                                        denyButtonText: 'Xóa điểm',
                                        denyButtonColor: '#ef4444',
                                        cancelButtonText: 'Hủy'
                                      }).then(result => {
                                        if (result.isConfirmed) {
                                          const newVal = parseFloat(result.value);
                                          const newArr = [...grade.m15];
                                          newArr[idx] = newVal;
                                          handleUpdateGrade(student.id, 'm15', newArr);
                                        } else if (result.isDenied) {
                                          const newArr = grade.m15.filter((_, i) => i !== idx);
                                          handleUpdateGrade(student.id, 'm15', newArr);
                                        }
                                      });
                                    }}
                                    className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-bold border border-slate-200 hover:bg-white hover:shadow-sm transition-all"
                                  >
                                    {s}
                                  </button>
                                ))}
                                <button className="text-blue-500 hover:text-blue-700"
                                   onClick={() => {
                                    Swal.fire({
                                      title: 'Thêm điểm 15 phút',
                                      input: 'number',
                                      inputAttributes: { min: '0', max: '10', step: '0.1' }
                                    }).then(result => {
                                      if (result.isConfirmed) handleUpdateGrade(student.id, 'm15', [...grade.m15, parseFloat(result.value)]);
                                    });
                                  }}
                                >
                                  <PlusCircle size={14} />
                                </button>
                              </div>
                            </td>
                            {/* Giữa kỳ */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-wrap justify-center gap-1 min-w-[80px]">
                                {grade.h1.map((s, idx) => (
                                  <button 
                                    key={idx} 
                                    onClick={() => {
                                      Swal.fire({
                                        title: 'Chỉnh sửa điểm Giữa kỳ',
                                        input: 'number',
                                        inputValue: s,
                                        inputAttributes: { min: '0', max: '10', step: '0.1' },
                                        showDenyButton: true,
                                        showCancelButton: true,
                                        confirmButtonText: 'Cập nhật',
                                        denyButtonText: 'Xóa điểm',
                                        denyButtonColor: '#ef4444',
                                        cancelButtonText: 'Hủy'
                                      }).then(result => {
                                        if (result.isConfirmed) {
                                          const newVal = parseFloat(result.value);
                                          const newArr = [...grade.h1];
                                          newArr[idx] = newVal;
                                          handleUpdateGrade(student.id, 'h1', newArr);
                                        } else if (result.isDenied) {
                                          const newArr = grade.h1.filter((_, i) => i !== idx);
                                          handleUpdateGrade(student.id, 'h1', newArr);
                                        }
                                      });
                                    }}
                                    className="bg-indigo-50 px-1.5 py-0.5 rounded text-xs font-bold border border-indigo-200 text-indigo-700 hover:bg-white transition-all shadow-sm"
                                  >
                                    {s}
                                  </button>
                                ))}
                                <button className="text-indigo-500"
                                  onClick={() => {
                                    Swal.fire({ title: 'Thêm điểm Giữa kỳ (x2)', input: 'number' }).then(res => {
                                      if (res.isConfirmed) handleUpdateGrade(student.id, 'h1', [...grade.h1, parseFloat(res.value)]);
                                    });
                                  }}
                                >
                                  <PlusCircle size={14} />
                                </button>
                              </div>
                            </td>
                            {/* Cuối Kỳ */}
                            <td className="px-6 py-4 text-center">
                               <button 
                                  onClick={() => {
                                    Swal.fire({
                                      title: 'Nhập điểm Cuối kỳ (x3)',
                                      input: 'number',
                                      inputValue: grade.semester || ''
                                    }).then(res => {
                                      if (res.isConfirmed) handleUpdateGrade(student.id, 'semester', parseFloat(res.value));
                                    });
                                  }}
                                  className={`px-3 py-1 rounded-lg border font-bold text-xs transition-all ${grade.semester !== null ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                >
                                  {grade.semester !== null ? grade.semester : 'Chưa nhập'}
                                </button>
                            </td>
                            {/* Điểm Cộng */}
                            <td className="px-6 py-4 text-center bg-emerald-50/10">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-black text-emerald-600 text-sm">+{grade.bonusTotal || 0}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => updateBonus(student.id, -0.25)} className="text-emerald-500 hover:scale-110 transition-transform">
                                    <MinusCircle size={14} />
                                  </button>
                                  <button onClick={() => updateBonus(student.id, 0.25)} className="text-emerald-500 hover:scale-110 transition-transform">
                                    <PlusCircle size={14} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            {/* Điểm Trừ */}
                            <td className="px-6 py-4 text-center bg-rose-50/10">
                               <div className="flex flex-col items-center gap-1">
                                <span className="font-black text-rose-600 text-sm">-{grade.penaltyTotal || 0}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => updatePenalty(student.id, -0.25)} className="text-rose-500 hover:scale-110 transition-transform">
                                    <MinusCircle size={14} />
                                  </button>
                                  <button onClick={() => updatePenalty(student.id, 0.25)} className="text-rose-500 hover:scale-110 transition-transform">
                                    <PlusCircle size={14} />
                                  </button>
                                </div>
                              </div>
                            </td>
                            {/* Điểm Ròng */}
                            <td className="px-6 py-4 text-center bg-indigo-50/20">
                              <span className={`text-sm font-bold ${((grade.bonusTotal || 0) - (grade.penaltyTotal || 0)) > 0 ? 'text-emerald-600' : ((grade.bonusTotal || 0) - (grade.penaltyTotal || 0)) < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {((grade.bonusTotal || 0) - (grade.penaltyTotal || 0)) > 0 ? '+' : ''}{(grade.bonusTotal || 0) - (grade.penaltyTotal || 0)}
                              </span>
                            </td>
                            {/* ĐTB */}
                            <td className="px-6 py-4 text-center bg-blue-50/20">
                              <span className={`text-lg font-black ${rank.color}`}>
                                {avg || '0'}
                              </span>
                            </td>
                            {/* Action */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => {
                                    const mHistory = grade.monthlyHistory || [];
                                    if (mHistory.length === 0) {
                                      Swal.fire('Thông báo', 'Học sinh này chưa có dữ liệu chốt kỳ nào.', 'info');
                                    } else {
                                      const tableRows = mHistory.map(h => `
                                        <tr class="border-b">
                                          <td class="p-2 text-left">${h.month}</td>
                                          <td class="p-2 text-emerald-600 font-bold">+${h.bonus}</td>
                                          <td class="p-2 text-rose-600 font-bold">-${h.penalty}</td>
                                          <td class="p-2 font-black ${h.net > 0 ? 'text-emerald-600' : h.net < 0 ? 'text-rose-600' : 'text-slate-500'}">${h.net > 0 ? '+' : ''}${h.net}</td>
                                          <td class="p-2 text-sm">${h.suggestion}</td>
                                        </tr>
                                      `).join('');
                                      
                                      Swal.fire({
                                        title: `Lịch sử chốt kỳ: ${student.name}`,
                                        html: `
                                          <div class="max-h-[60vh] overflow-y-auto">
                                            <table class="w-full text-sm">
                                              <thead class="bg-slate-50 sticky top-0">
                                                <tr>
                                                  <th class="p-2 text-left text-slate-500">Chu kỳ</th>
                                                  <th class="p-2 text-slate-500">Cộng</th>
                                                  <th class="p-2 text-slate-500">Trừ</th>
                                                  <th class="p-2 text-slate-500">Ròng</th>
                                                  <th class="p-2 text-slate-500">Gợi ý</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                ${tableRows}
                                              </tbody>
                                            </table>
                                          </div>
                                        `,
                                        width: '600px',
                                        confirmButtonText: 'Đóng'
                                      });
                                    }
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Xem lịch sử chốt kỳ"
                                >
                                  <Clock size={18} />
                                </button>
                                <button 
                                  onClick={() => handleAiAnalyze(student)} 
                                  disabled={isAiLoading}
                                  className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                                  title="Phân tích AI"
                                >
                                  <BrainCircuit size={18} className={isAiLoading ? "animate-pulse" : ""} />
                                </button>
                                <button 
                                  onClick={() => {
                                    Swal.fire({
                                      title: 'Xóa học sinh?',
                                      text: `Bạn có chắc muốn xóa học sinh ${student.name}?`,
                                      icon: 'warning',
                                      showCancelButton: true,
                                      confirmButtonText: 'Đồng ý xóa',
                                      cancelButtonText: 'Hủy',
                                      confirmButtonColor: '#ef4444'
                                    }).then(res => {
                                      if (res.isConfirmed) {
                                        setData(prev => {
                                          const newStudents = prev.students[selectedClassId].filter(s => s.id !== student.id);
                                          const newGrades = prev.grades[selectedClassId].filter(g => g.studentId !== student.id);
                                          return {
                                            ...prev,
                                            students: { ...prev.students, [selectedClassId]: newStudents },
                                            grades: { ...prev.grades, [selectedClassId]: newGrades }
                                          };
                                        });
                                      }
                                    });
                                  }}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" 
                                  title="Xóa"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {classStudents.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                    <Users size={48} strokeWidth={1.5} className="mb-4 opacity-20" />
                    <p>Chưa có học sinh nào trong lớp này</p>
                    <button 
                      onClick={() => {
                        Swal.fire({
                          title: 'Thêm học sinh',
                          html: `
                            <input id="swal-new-student-name" class="swal2-input" placeholder="Họ và Tên">
                            <select id="swal-new-student-gender" class="swal2-select">
                              <option value="Nam">Nam</option>
                              <option value="Nữ">Nữ</option>
                            </select>
                          `,
                          showCancelButton: true,
                          confirmButtonText: 'Thêm',
                          cancelButtonText: 'Hủy',
                          preConfirm: () => {
                            const name = (document.getElementById('swal-new-student-name') as HTMLInputElement).value;
                            const gender = (document.getElementById('swal-new-student-gender') as HTMLSelectElement).value as 'Nam' | 'Nữ';
                            if (!name) Swal.showValidationMessage('Vui lòng nhập tên');
                            return { name, gender };
                          }
                        }).then(res => {
                          if (res.isConfirmed) {
                            const newId = `s_${Date.now()}`;
                            setData(prev => ({
                              ...prev,
                              students: { ...prev.students, [selectedClassId]: [...(prev.students[selectedClassId] || []), { id: newId, name: res.value.name, gender: res.value.gender }] },
                              grades: { ...prev.grades, [selectedClassId]: [...(prev.grades[selectedClassId] || []), { studentId: newId, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 }] }
                            }));
                          }
                        });
                      }}
                      className="mt-4 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-colors"
                    >
                      <Plus size={18} /> Thêm học sinh
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-slate-200 card-shadow overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Clock size={20} className="text-blue-500" />
                    Lịch sử chỉnh sửa điểm
                  </h3>
                  <button 
                    onClick={() => setData(prev => ({ ...prev, history: [] }))}
                    className="text-xs text-rose-500 font-bold hover:underline"
                  >
                    Xóa nhật ký
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-center">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-left">Thời gian</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-left">Học sinh</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Loại điểm</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Giá trị cũ</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Giá trị mới</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const allStudents = Object.values(data.students).flat() as Student[];
                        return data.history.filter(h => {
                          const studentName = allStudents.find(s => s.id === h.studentId)?.name || '';
                          return studentName.toLowerCase().includes(searchQuery.toLowerCase());
                        }).map((item) => {
                          const student = allStudents.find(s => s.id === item.studentId);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                {dayjs(item.timestamp).format('HH:mm - DD/MM/YYYY')}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                    {student?.name.charAt(0)}
                                  </div>
                                  <span className="font-bold text-slate-700">{student?.name || 'HS đã xóa'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase">
                                  {item.type}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center text-sm text-slate-400 italic">
                                {item.oldValue}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="font-black text-slate-900">{item.newValue}</span>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
                {data.history.length === 0 && (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                    <History size={48} strokeWidth={1} className="mb-4 opacity-20" />
                    <p className="font-medium">Chưa có lịch sử thay đổi nào</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 card-shadow">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <BarChart3 size={20} className="text-blue-500" />
                    Thống kê phân bổ học lực: {activeClass?.name}
                  </h3>
                  <div className="h-80">
                    <Bar 
                      data={{
                        labels: ['Giỏi (8-10)', 'Khá (6.5-7.9)', 'Trung bình (5-6.4)', 'Yếu (<5)'],
                        datasets: [{
                          label: 'Số lượng học sinh',
                          data: [stats.gioi, stats.kha, stats.tb, stats.yeu],
                          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                          borderRadius: 8,
                          barThickness: 50
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 card-shadow flex flex-col items-center">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 w-full">Tỷ lệ Xếp loại</h3>
                  <div className="w-full max-w-[240px] mb-6">
                    <Pie 
                      data={{
                        labels: ['Giỏi', 'Khá', 'TB', 'Yếu'],
                        datasets: [{
                          data: [stats.gioi, stats.kha, stats.tb, stats.yeu],
                          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
                          borderWidth: 0
                        }]
                      }}
                    />
                  </div>
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-xs font-semibold text-emerald-800">Tỷ lệ Giỏi/Khá</span>
                      </div>
                      <span className="font-bold text-emerald-700">
                        {Math.round(((stats.gioi + stats.kha) / stats.total) * 100) || 0}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center italic">Biểu đồ cập nhật tự động khi điểm số thay đổi</p>
                  </div>
                </div>
              </div>

               <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl">
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold flex items-center gap-3 mb-2 italic">
                    <BrainCircuit size={28} />
                    Cố vấn AI đề xuất
                  </h3>
                  <p className="text-blue-100 mb-6 max-w-xl">
                    Dựa trên dữ liệu thống kê lớp {activeClass?.name}, Gemini AI nhận thấy tỷ lệ học sinh khá giỏi đang ở mức tốt. 
                    Tuy nhiên, cần quan tâm thêm đến nhóm học sinh yếu ({stats.yeu} bạn) để có kế hoạch phụ đạo kịp thời.
                  </p>
                  <button onClick={() => {
                    if(!data.settings.geminiApiKey) { Swal.fire('Lỗi', 'Chưa có API Key', 'error'); return; }
                     Swal.fire('Đang kết nối AI...', 'Vui lòng chờ giây lát', 'info');
                     // Simulating a more complex query
                  }} className="bg-white text-blue-700 px-6 py-2.5 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-lg flex items-center gap-2">
                    Xây dựng lộ trình giảng dạy AI <ChevronRight size={18} />
                  </button>
                </div>
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <GraduationCap size={160} />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
                <div className="flex items-center gap-3 mb-8">
                   <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                     <SettingsIcon size={24} />
                   </div>
                   <div>
                     <h3 className="text-xl font-bold text-slate-900">Cấu hình hệ thống</h3>
                     <p className="text-sm text-slate-500">Thiết lập hệ thống thông minh</p>
                   </div>
                </div>

                <div className="space-y-6">
                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <BrainCircuit className="text-blue-500" size={20} />
                      <h4 className="font-bold text-slate-900">Cấu hình Gemini AI</h4>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">API Key</label>
                      <input 
                        type="password" 
                        placeholder="Nhập Gemini API Key của bạn..."
                        value={data.settings.geminiApiKey || ''}
                        onChange={(e) => setData(prev => ({ ...prev, settings: { ...prev.settings, geminiApiKey: e.target.value } }))}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-slate-500 mt-2">
                        Lấy API key tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-600 font-medium hover:underline">Google AI Studio</a>. Key được lưu an toàn trên trình duyệt của bạn.
                      </p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-200">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Model AI ưu tiên</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash'].map(model => (
                          <button
                            key={model}
                            onClick={() => setData(prev => ({ ...prev, settings: { ...prev.settings, modelName: model } }))}
                            className={`p-3 text-left rounded-xl border text-sm transition-all ${data.settings.modelName === model ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          >
                            <span className="block font-bold text-slate-800">{model}</span>
                            <span className="text-[10px] text-slate-500">{model === 'gemini-3-flash-preview' ? 'Nhanh, mặc định' : model === 'gemini-3-pro-preview' ? 'Chính xác cao' : 'Cơ bản (Dự phòng)'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Sao lưu dữ liệu</p>
                      <p className="text-xs text-slate-500">Tải dữ liệu hiện tại về máy dạng JSON</p>
                    </div>
                    <button 
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `smartgrade_backup_${dayjs().format('YYYYMMDD')}.json`;
                        a.click();
                      }}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all flex items-center gap-2"
                    >
                      <Download size={16} /> Export JSON
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Xóa toàn bộ dữ liệu</p>
                      <p className="text-xs text-rose-500 italic">Hành động này không thể hoàn tác!</p>
                    </div>
                    <button 
                      onClick={() => {
                        Swal.fire({
                          title: 'Bạn chắc chắn?',
                          text: 'Dữ liệu sẽ bị xóa hoàn toàn khỏi trình duyệt!',
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonColor: '#ef4444',
                          confirmButtonText: 'Có, xóa hết!'
                        }).then(res => { if(res.isConfirmed) { localStorage.removeItem('smartgrade_data'); window.location.reload(); }});
                      }}
                      className="px-4 py-2 border border-rose-200 text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-50 transition-all"
                    >
                      Reset App
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => { Swal.fire('Thành công', 'Đã lưu cấu hình!', 'success'); setActiveTab('dashboard'); }}
                  className="w-full mt-10 gradient-bg text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-all"
                >
                  <Save size={20} />
                  Áp dụng & Lưu cấu hình
                </button>
              </div>

              <div className="text-center">
                <p className="text-slate-400 text-xs">Phát triển cho giáo viên THCS Việt Nam v1.0.0</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Button for Mobile */}
      <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3">
         <button onClick={() => setActiveTab('grading')} className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center">
            <GraduationCap size={24} />
         </button>
      </div>
    </div>
  );
}
