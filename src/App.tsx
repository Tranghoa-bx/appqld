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
  CalendarCheck,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { marked } from 'marked';
import { AppData, Grade, Student, HistoryRecord } from './types';
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

// --- Constants internalized to avoid build export issues ---
const DEFAULT_YEARS = ['2026-2027'];
const AVAILABLE_SEMESTERS = [{id: 'HK1', name: 'Học kỳ I'}, {id: 'HK2', name: 'Học kỳ II'}, {id: 'CN', name: 'Cả năm'}];
const DEFAULT_SUBJECTS = ['Toán', 'Ngữ văn', 'Ngoại ngữ', 'Vật lý', 'Hóa học', 'Sinh học', 'KHTN', 'Lịch sử', 'Địa lý', 'LS&ĐL', 'GDCD', 'Tin học', 'Công nghệ', 'Thể dục', 'Nghệ thuật', 'HĐTN, HN', 'GDKT & PL'];

const SCORE_WEIGHTS = {
  oral: 1,
  m15: 1,
  h1: 2,
  semester: 3
};

const stripAiSpecialChars = (text: string) => {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#/g, "")
    .replace(/> /g, "")
    .replace(/- /g, "• ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/s_\d+_\d+/g, "") // Xóa mã ID học sinh
    .replace(/s_\d+/g, "")     // Xóa mã ID học sinh dạng ngắn
    .replace(/studentId|oral|m15|h1|semester|bonusTotal|penaltyTotal|average/gi, "") // Xóa từ khóa kỹ thuật
    .replace(/Chào bạn.*như sau:/gs, "") // Xóa lời chào AI
    .replace(/Dựa trên dữ liệu.*như sau:/gs, "") // Xóa câu dẫn AI
    .replace(/\{.*\}/g, "")    // Xóa JSON nếu AI lỡ ghi ra
    .replace(/\n\s*\n/g, "\n") // Xóa dòng trống thừa
    .trim();
};

const SCORE_RANGES = [
  { label: '0 <= Điểm <= 3.4', min: 0, max: 3.4 },
  { label: '3.5 <= Điểm <= 4.9', min: 3.5, max: 4.9 },
  { label: '5 <= Điểm <= 5.9', min: 5, max: 5.9 },
  { label: '6 <= Điểm <= 6.9', min: 6, max: 6.9 },
  { label: '7 <= Điểm <= 7.4', min: 7, max: 7.4 },
  { label: '7.5 <= Điểm <= 7.9', min: 7.5, max: 7.9 },
  { label: '8 <= Điểm <= 8.9', min: 8, max: 8.9 },
  { label: '9 <= Điểm <= 10', min: 9, max: 10 },
];

const ALL_COLUMNS = [
  { id: 'code', name: 'Mã HS' },
  { id: 'name', name: 'Họ và Tên' },
  { id: 'birthday', name: 'Ngày sinh' },
  { id: 'gender', name: 'Nam/Nữ' },
  { id: 'tx1', name: 'TX1' },
  { id: 'tx2', name: 'TX2' },
  { id: 'tx3', name: 'TX3' },
  { id: 'tx4', name: 'TX4' },
  { id: 'h1', name: 'Giữa Kỳ' },
  { id: 'semester', name: 'Cuối Kỳ' },
  { id: 'bonus', name: 'Điểm Cộng' },
  { id: 'penalty', name: 'Điểm Trừ' },
  { id: 'net', name: 'Điểm Ròng' },
  { id: 'avg', name: 'ĐTB' },
  { id: 'rank', name: 'Hạng' },
  { id: 'comment', name: 'Nhận xét' },
];

const INITIAL_DATA: AppData = {
  classes: [
    { id: '9a1', name: 'Lớp 9A1', gradeLevel: '9', subject: 'Toán học' },
    { id: '9a2', name: 'Lớp 9A2', gradeLevel: '9', subject: 'Ngữ văn' },
    { id: '6a1', name: 'Lớp 6A1', gradeLevel: '6', subject: 'Toán học' },
  ].sort((a, b) => (a.gradeLevel || '').localeCompare(b.gradeLevel || '') || a.name.localeCompare(b.name)),
  students: {
    '9a1': [
      { id: 's1', code: '2024001', name: 'Nguyễn Văn An', gender: 'Nam', birthday: '2010-05-15' },
      { id: 's2', code: '2024002', name: 'Trần Thị Bình', gender: 'Nữ', birthday: '2010-08-20' },
      { id: 's3', code: '2024003', name: 'Lê Hoàng Long', gender: 'Nam', birthday: '2010-12-01' },
      { id: 's4', code: '2024004', name: 'Phạm Minh Châu', gender: 'Nữ', birthday: '2010-02-12' },
      { id: 's5', code: '2024005', name: 'Hoàng Quốc Việt', gender: 'Nam', birthday: '2010-07-30' },
    ],
    '9a2': [
      { id: 's6', code: '2024006', name: 'Đặng Thùy Chi', gender: 'Nữ', birthday: '2010-03-05' },
      { id: 's7', code: '2024007', name: 'Vũ Minh Đức', gender: 'Nam', birthday: '2010-10-10' },
    ]
  },
  grades: {
    '9a1': [
      { studentId: 's1', oral: [8, 9], m15: [7], h1: [8.5], semester: 8, bonusTotal: 0.5, penaltyTotal: 0 },
      { studentId: 's2', oral: [7, 6], m15: [8], h1: [7.5], semester: 9, bonusTotal: 0, penaltyTotal: 0.5 },
      { studentId: 's3', oral: [9], m15: [9, 10], h1: [9], semester: 9.5, bonusTotal: 1.0, penaltyTotal: 0 },
      { studentId: 's4', oral: [5, 6], m15: [6], h1: [5.5], semester: 6, bonusTotal: 0, penaltyTotal: 1.0 },
      { studentId: 's5', oral: [8], m15: [7], h1: [7], semester: null, bonusTotal: 0.25, penaltyTotal: 0.25 },
    ],
    '9a2': [
      { studentId: 's6', oral: [9], m15: [9], h1: [8], semester: 8.5, bonusTotal: 0.5, penaltyTotal: 0 },
      { studentId: 's7', oral: [4], m15: [5, 4], h1: [6], semester: null, bonusTotal: 0, penaltyTotal: 1.5 },
    ]
  },
  history: [],
  settings: {
    geminiApiKey: '',
    modelName: 'gemini-1.5-flash',
    theme: 'light',
    schoolYears: DEFAULT_YEARS,
    visibleColumns: ['code', 'name', 'birthday', 'gender', 'tx1', 'tx2', 'tx3', 'tx4', 'h1', 'semester', 'bonus', 'penalty', 'net', 'avg', 'rank', 'comment'],
    commentTemplates: []
  }
};

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
      if (parsed.grades) {
        let needsMigration = false;
        const newGrades: any = {};
        for (const [key, grades] of Object.entries(parsed.grades)) {
          if (!key.includes('_')) {
            needsMigration = true;
            const cls = parsed.classes?.find((c: any) => c.id === key);
            const subject = cls?.subject || 'Toán';
            const newKey = `2023-2024_HK1_${subject}_${key}`;
            newGrades[newKey] = grades;
          } else {
            newGrades[key] = grades;
          }
        }
        if (needsMigration) {
          parsed.grades = newGrades;
        }
      }
      const mergedSettings = { ...INITIAL_DATA.settings, ...(parsed.settings || {}) };
      // Always include full DEFAULT_YEARS, plus any custom years user added (2026+)
      const savedYears: string[] = (mergedSettings.schoolYears || []).filter(
        (y: string) => parseInt(y.split('-')[0]) >= 2026
      );
      const combinedYears = Array.from(new Set([...DEFAULT_YEARS, ...savedYears])).sort();
      mergedSettings.schoolYears = combinedYears;
      return { ...INITIAL_DATA, ...parsed, settings: mergedSettings };
    }
    return INITIAL_DATA;
  });

  const availableYears = data.settings.schoolYears || DEFAULT_YEARS;
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'grading' | 'settings' | 'history' | 'templates'>('dashboard');
  const [selectedYear, setSelectedYear] = useState(data.settings.lastYear || availableYears[availableYears.length - 1]);
  const [selectedSemester, setSelectedSemester] = useState(data.settings.lastSemester || 'HK1');
  const [selectedSubject, setSelectedSubject] = useState(data.settings.lastSubject || 'Toán');
  const [selectedClassId, setSelectedClassId] = useState<string>(data.settings.lastClassId || data.classes[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [showRankId, setShowRankId] = useState<string | null>(null);

  const [draftGrades, setDraftGrades] = useState<Record<string, Record<string, string>>>({});
  const [showDeletedHistory, setShowDeletedHistory] = useState(false);
  const [historyFilterYear, setHistoryFilterYear] = useState('');
  const [historyFilterClass, setHistoryFilterClass] = useState('');
  const [historyFilterSemester, setHistoryFilterSemester] = useState('');

  useEffect(() => {
    setDraftGrades({});
  }, [selectedClassId, selectedYear, selectedSemester, selectedSubject]);

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
      history: [record, ...prev.history].slice(0, 5000)
    }));
  };

  const activeClass = data.classes.find(c => c.id === selectedClassId);
  const classStudents = selectedClassId ? (data.students[selectedClassId] || []) : [];
  const gradeKey = `${selectedYear}_${selectedSemester}_${selectedSubject}_${selectedClassId}`;
  
  // Lazy init grades for rendering
  const classGrades = classStudents.map(student => {
    const existing = (data.grades[gradeKey] || []).find(g => g.studentId === student.id);
    return existing || { studentId: student.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 };
  });

  const parseGrades = (input: string): number[] => {
    if (!input.trim()) return [];
    return input.split(/[, \t]+/)
      .map(s => parseFloat(s.trim().replace(',', '.')))
      .filter(n => !isNaN(n) && n >= 0 && n <= 10);
  };

  const handleSaveDrafts = () => {
    if (Object.keys(draftGrades).length === 0) return;

    Swal.fire({
      title: 'Lưu thay đổi?',
      text: 'Bạn có chắc chắn muốn lưu các điểm vừa nhập?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Đồng ý lưu',
      cancelButtonText: 'Hủy'
    }).then(res => {
      if (res.isConfirmed) {
        setData(prev => {
          const gradesArray = prev.grades[gradeKey] || [];
          let newGrades = [...gradesArray];
          let newHistory = [...prev.history];
          const timestamp = new Date().toISOString();

          Object.entries(draftGrades).forEach(([studentId, edits]) => {
            let index = newGrades.findIndex(g => g.studentId === studentId);
            if (index === -1) {
              newGrades.push({ studentId, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 });
              index = newGrades.length - 1;
            }
            
            const currentGrade = { ...newGrades[index] };
            
            const processField = (field: keyof Grade, fieldName: string, isArray: boolean) => {
              if (edits[field] !== undefined) {
                const oldVal = currentGrade[field];
                let newVal: any = null;
                
                if (isArray) {
                  newVal = parseGrades(edits[field]);
                } else {
                  const num = parseFloat(edits[field].replace(',', '.'));
                  newVal = (!isNaN(num) && num >= 0 && num <= 10) ? num : null;
                }

                const oldStr = Array.isArray(oldVal) ? `[${oldVal.join(', ')}]` : oldVal === null ? 'Trống' : oldVal;
                const newStr = Array.isArray(newVal) ? `[${newVal.join(', ')}]` : newVal === null ? 'Trống' : newVal;

                if (oldStr !== newStr) {
                  currentGrade[field] = newVal;
                  newHistory.unshift({
                    id: Math.random().toString(36).substr(2, 9),
                    studentId,
                    timestamp,
                    type: fieldName as any,
                    oldValue: String(oldStr),
                    newValue: String(newStr)
                  });
                }
              }
            };

            // Handle TX1-TX4: Individual tracking
            const parseNum = (v: string) => { 
              if (v === undefined || v === null) return undefined;
              const n = parseFloat(v.replace(',', '.')); 
              return (!isNaN(n) && n >= 0 && n <= 10) ? n : null; 
            };
            
            const newOral = [...currentGrade.oral];
            const newM15 = [...currentGrade.m15];
            
            const txConfigs = [
              { key: 'tx1', array: newOral, idx: 0, label: 'TX1' },
              { key: 'tx2', array: newOral, idx: 1, label: 'TX2' },
              { key: 'tx3', array: newM15, idx: 0, label: 'TX3' },
              { key: 'tx4', array: newM15, idx: 1, label: 'TX4' },
            ];
            
            txConfigs.forEach(conf => {
              if (edits[conf.key] !== undefined) {
                const oldV = conf.array[conf.idx];
                const newV = parseNum(edits[conf.key]);
                
                const oldStr = (oldV === undefined || oldV === null) ? 'Trống' : String(oldV);
                const newStr = (newV === null || newV === undefined) ? 'Trống' : String(newV);
                
                if (oldStr !== newStr) {
                  if (newV !== null && newV !== undefined) {
                    conf.array[conf.idx] = newV;
                  } else {
                    // If newVal is null (cleared), remove it
                    if (conf.array.length > conf.idx) {
                      conf.array.splice(conf.idx, 1);
                    }
                  }
                  
                  newHistory.unshift({
                    id: Math.random().toString(36).substr(2, 9),
                    studentId,
                    timestamp,
                    type: conf.label as any,
                    oldValue: oldStr,
                    newValue: newStr
                  });
                }
              }
            });
            
            currentGrade.oral = newOral.filter((v): v is number => v !== null && v !== undefined);
            currentGrade.m15 = newM15.filter((v): v is number => v !== null && v !== undefined);
            processField('h1', 'Giữa Kỳ', true);
            processField('semester', 'Cuối Kỳ', false);

            // Handle Bonus/Penalty
            if (edits.bonusTotal !== undefined) {
              const oldVal = currentGrade.bonusTotal || 0;
              const newVal = parseFloat(edits.bonusTotal);
              if (oldVal !== newVal) {
                currentGrade.bonusTotal = newVal;
                newHistory.unshift({ id: Math.random().toString(36).substr(2,9), studentId, timestamp, type: 'Cộng' as any, oldValue: String(oldVal), newValue: String(newVal) });
              }
            }
            if (edits.penaltyTotal !== undefined) {
              const oldVal = currentGrade.penaltyTotal || 0;
              const newVal = parseFloat(edits.penaltyTotal);
              if (oldVal !== newVal) {
                currentGrade.penaltyTotal = newVal;
                newHistory.unshift({ id: Math.random().toString(36).substr(2,9), studentId, timestamp, type: 'Trừ' as any, oldValue: String(oldVal), newValue: String(newVal) });
              }
            }

            newGrades[index] = currentGrade;
          });

          return {
            ...prev,
            grades: { ...prev.grades, [gradeKey]: newGrades },
            history: newHistory.slice(0, 1000)
          };
        });

        setDraftGrades({});
        Swal.fire('Thành công', 'Đã lưu điểm thành công!', 'success');
      }
    });
  };

  const normalRanks: Record<string, number> = {};
  if (selectedSemester !== 'CN') {
    const sortedNormal = [...classStudents].map(s => {
      const g = classGrades.find(grade => grade.studentId === s.id);
      return { id: s.id, avg: g ? calculateAverage(g) : 0 };
    }).sort((a, b) => b.avg - a.avg);
    
    let currentRank = 1;
    for (let i = 0; i < sortedNormal.length; i++) {
      if (i > 0 && sortedNormal[i].avg < sortedNormal[i - 1].avg) {
        currentRank = i + 1;
      }
      normalRanks[sortedNormal[i].id] = currentRank;
    }
  }

  const cnRanks: Record<string, number> = {};
  if (selectedSemester === 'CN') {
    const sortedCn = [...classStudents].map(student => {
      const hk1Key = `${selectedYear}_HK1_${selectedSubject}_${selectedClassId}`;
      const hk2Key = `${selectedYear}_HK2_${selectedSubject}_${selectedClassId}`;
      const hk1Grade = (data.grades[hk1Key] || []).find(g => g.studentId === student.id);
      const hk2Grade = (data.grades[hk2Key] || []).find(g => g.studentId === student.id);
      
      const avg1 = hk1Grade ? calculateAverage(hk1Grade) : 0;
      const avg2 = hk2Grade ? calculateAverage(hk2Grade) : 0;
      let cnAvg = 0;
      if (avg1 > 0 || avg2 > 0) cnAvg = Math.round(((avg1 + avg2 * 2) / 3) * 10) / 10;
      return { id: student.id, cnAvg };
    }).sort((a, b) => b.cnAvg - a.cnAvg);

    let cnCurrentRank = 1;
    for (let i = 0; i < sortedCn.length; i++) {
      if (i > 0 && sortedCn[i].cnAvg < sortedCn[i - 1].cnAvg) {
        cnCurrentRank = i + 1;
      }
      cnRanks[sortedCn[i].id] = cnCurrentRank;
    }
  }

   const handleUpdateGrade = (studentId: string, field: keyof Grade, value: any) => {
    setData(prev => {
      const gradesArray = prev.grades[gradeKey] || [];
      const index = gradesArray.findIndex(g => g.studentId === studentId);
      let newGrades = [...gradesArray];
      if (index !== -1) {
        newGrades[index] = { ...newGrades[index], [field]: value };
      } else {
        newGrades.push({ studentId, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0, [field]: value });
      }
      return { ...prev, grades: { ...prev.grades, [gradeKey]: newGrades } };
    });
  };

  const updateBonus = (studentId: string, amount: number) => {
    setDraftGrades(prev => {
      const edits = prev[studentId] || {};
      const grade = classGrades.find(g => g.studentId === studentId);
      const baseVal = grade?.bonusTotal || 0;
      const currentDraftVal = edits.bonusTotal !== undefined ? parseFloat(edits.bonusTotal) : baseVal;
      const newVal = Math.max(0, currentDraftVal + amount);
      return {
        ...prev,
        [studentId]: { ...edits, bonusTotal: String(newVal) }
      };
    });
  };

  const updatePenalty = (studentId: string, amount: number) => {
    setDraftGrades(prev => {
      const edits = prev[studentId] || {};
      const grade = classGrades.find(g => g.studentId === studentId);
      const baseVal = grade?.penaltyTotal || 0;
      const currentDraftVal = edits.penaltyTotal !== undefined ? parseFloat(edits.penaltyTotal) : baseVal;
      const newVal = Math.max(0, currentDraftVal + amount);
      return {
        ...prev,
        [studentId]: { ...edits, penaltyTotal: String(newVal) }
      };
    });
  };

  const exportToWord = () => {
    if (!activeClass || classStudents.length === 0) return;
    
    const htmlHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Báo cáo Phân tích AI</title>
      <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.15; color: #000; }
        .header { text-align: center; margin-bottom: 25px; }
        .student-section { margin-bottom: 25px; border-bottom: 1px solid #ccc; padding-bottom: 15px; page-break-inside: avoid; }
        .student-name { font-size: 14pt; font-weight: bold; margin-bottom: 8px; text-decoration: underline; }
        .analysis-content { font-size: 12pt; text-align: left; margin-left: 10px; }
        .footer { font-size: 10pt; color: #444; margin-top: 40px; text-align: right; font-style: italic; }
      </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin-bottom: 5px;">PHÂN TÍCH KẾT QUẢ HỌC TẬP LỚP ${activeClass.name}</h1>
          <p>Lớp: ${activeClass.name} | Học kỳ: ${selectedSemester} | Năm học: ${selectedYear}</p>
          <hr/>
        </div>
    `;

    const sections = classStudents.map((s, idx) => {
      const g = (data.grades[gradeKey] || []).find(grade => grade.studentId === s.id);
      const cleanedAnalysis = stripAiSpecialChars(g?.aiAnalysis || "Chưa có dữ liệu phân tích AI cho học sinh này.");
      // In đậm các mục số 1., 2., 3.
      const formattedAnalysis = cleanedAnalysis.replace(/^(\d+\.)/gm, '<b>$1</b>');
      
      return `
        <div class="student-section">
          <div class="student-name">Học sinh: ${s.name}</div>
          <div class="analysis-content">
            ${formattedAnalysis.replace(/\n/g, '<br/>')}
          </div>
        </div>
      `;
    }).join('');

    const htmlFooter = `
        <div class="footer">
          <p>Ngày xuất: ${dayjs().format('DD/MM/YYYY HH:mm')}</p>
          <p>Giáo viên: ${data.settings.teacherName || '...'}</p>
        </div>
      </body></html>
    `;

    const fullHtml = htmlHeader + sections + htmlFooter;
    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BaoCao_AI_${activeClass.name}_${dayjs().format('YYYYMMDD')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Swal.fire('Thành công', 'Đã xuất file Word báo cáo AI!', 'success');
  };

  const exportExcel = () => {
    if (!activeClass) return;
    
    // 1. Tạo dữ liệu cho sheet chính
    const title = [["BÁO CÁO KẾT QUẢ HỌC TẬP"]];
    const info = [
      [`Lớp: ${activeClass.name}`, `Năm học: ${selectedYear}`, `Học kỳ: ${selectedSemester === 'CN' ? 'Cả năm' : selectedSemester}`, `Môn: ${selectedSubject}`],
      [`Giáo viên: ${data.settings.teacherName || '...'}`],
      []
    ];

    let tableHeaders: string[] = [];
    let tableData: any[][] = [];

    if (selectedSemester === 'CN') {
      tableHeaders = ['STT', 'Họ và Tên', 'ĐTB HK I', 'ĐTB HK II', 'ĐTB Cả năm', 'Hạng', 'Xếp loại'];
      tableData = classStudents.map((s, idx) => {
        const rowNum = idx + 6;
        const hk1Key = `${selectedYear}_HK1_${selectedSubject}_${selectedClassId}`;
        const hk2Key = `${selectedYear}_HK2_${selectedSubject}_${selectedClassId}`;
        const hk1Grade = (data.grades[hk1Key] || []).find(g => g.studentId === s.id);
        const hk2Grade = (data.grades[hk2Key] || []).find(g => g.studentId === s.id);
        const avg1 = hk1Grade ? calculateAverage(hk1Grade) : 0;
        const avg2 = hk2Grade ? calculateAverage(hk2Grade) : 0;
        const hasGrade = avg1 > 0 || avg2 > 0;
        const cnAvg = hasGrade ? Math.round(((avg1 + avg2 * 2) / 3) * 10) / 10 : 0;
        
        return [
          idx + 1,
          s.name,
          avg1 || 0,
          avg2 || 0,
          { f: `ROUND((C${rowNum}+D${rowNum}*2)/3,1)` },
          hasGrade ? cnRanks[s.id] : '',
          hasGrade ? getRank(cnAvg).label : ''
        ];
      });
    } else {
      tableHeaders = ['STT', 'Họ và Tên', 'TX1', 'TX2', 'TX3', 'TX4', 'Giữa Kỳ', 'Cuối Kỳ', 'ĐTB', 'Hạng', 'Xếp loại'];
      tableData = classStudents.map((s, idx) => {
        const rowNum = idx + 6;
        const g = classGrades.find(grade => grade.studentId === s.id);
        const avg = g ? calculateAverage(g) : 0;
        return [
          idx + 1,
          s.name,
          g?.oral[0] ?? 0,
          g?.oral[1] ?? 0,
          g?.m15[0] ?? 0,
          g?.m15[1] ?? 0,
          g?.h1[0] ?? 0,
          g?.semester ?? 0,
          { f: `ROUND((C${rowNum}+D${rowNum}+E${rowNum}+F${rowNum}+G${rowNum}*2+H${rowNum}*3)/9,1)` },
          avg > 0 ? normalRanks[s.id] : '',
          avg > 0 ? getRank(avg).label : ''
        ];
      });
    }

    const statRows = [
      [], [], // Cách 2 dòng
      ["THỐNG KÊ TỔNG HỢP HỌC LỰC"],
      ['Loại học lực', 'Số lượng', 'Tỷ lệ (%)'],
      ['Giỏi (8.0 - 10)', stats.gioi, `${Math.round((stats.gioi/stats.total)*100) || 0}%`],
      ['Khá (6.5 - 7.9)', stats.kha, `${Math.round((stats.kha/stats.total)*100) || 0}%`],
      ['Trung bình (5.0 - 6.4)', stats.tb, `${Math.round((stats.tb/stats.total)*100) || 0}%`],
      ['Yêu (< 5.0)', stats.yeu, `${Math.round((stats.yeu/stats.total)*100) || 0}%`],
      ['Tổng số', stats.total, '100%']
    ];

    const wsData = [...title, ...info, tableHeaders, ...tableData, ...statRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Cấu hình độ rộng cột
    ws['!cols'] = selectedSemester === 'CN' 
      ? [{ wch: 5 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }]
      : [{ wch: 5 }, { wch: 25 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];

    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bảng điểm & Thống kê");
    
    XLSX.writeFile(wb, `BaoCao_SmartGrade_${activeClass.name}_${selectedYear}.xlsx`);
    Swal.fire('Thành công', 'Đã xuất file Excel bảng điểm và thống kê!', 'success');
  };

  const handleConfigColumns = () => {
    const currentCols = data.settings.visibleColumns || ALL_COLUMNS.map(c => c.id);
    
    Swal.fire({
      title: 'Cấu hình hiển thị cột',
      html: `
        <div class="grid grid-cols-2 gap-2 text-left p-4">
          ${ALL_COLUMNS.map(col => `
            <label class="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-xl cursor-pointer border border-transparent hover:border-slate-100 transition-all">
              <input type="checkbox" id="col-${col.id}" ${currentCols.includes(col.id) ? 'checked' : ''} class="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500">
              <span class="text-sm font-bold text-slate-700">${col.name}</span>
            </label>
          `).join('')}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Áp dụng',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#3b82f6',
      preConfirm: () => {
        const selected = ALL_COLUMNS.filter(c => (document.getElementById(`col-${c.id}`) as HTMLInputElement).checked).map(c => c.id);
        if (selected.length === 0) {
          Swal.showValidationMessage('Vui lòng chọn ít nhất 1 cột');
        }
        return selected;
      }
    }).then(result => {
      if (result.isConfirmed) {
        setData(prev => ({
          ...prev,
          settings: { ...prev.settings, visibleColumns: result.value }
        }));
      }
    });
  };

  const handleBulkComment = () => {
    const templates = data.settings.commentTemplates || [];

    Swal.fire({
      title: 'Thiết lập nhận xét hàng loạt',
      html: `
        <div class="space-y-4 text-left p-2">
          <div class="grid grid-cols-2 gap-3">
             <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Khoảng điểm</label>
              <select id="bulk-range" class="swal2-select !m-0 !w-full text-sm">
                ${SCORE_RANGES.map((r, i) => `<option value="${i}">${r.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Áp dụng cho</label>
              <select id="bulk-target" class="swal2-select !m-0 !w-full text-sm">
                <option value="current">Lớp hiện tại</option>
                <option value="grade">Cùng khối lớp (${activeClass?.gradeLevel || '?'})</option>
                <option value="all">Tất cả các lớp</option>
              </select>
            </div>
          </div>
          
          ${templates.length > 0 ? `
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Nhận xét đã lưu (Nhấn để chọn)</p>
            <div class="max-h-32 overflow-y-auto space-y-1 pr-2">
              ${templates.map((t, i) => `
                <button type="button" 
                  onclick="document.getElementById('bulk-comment').value='${t.comment.replace(/'/g, "\\'")}'; document.getElementById('bulk-range').value='${t.rangeIdx}'" 
                  class="w-full text-left p-2 text-[11px] hover:bg-white rounded border border-transparent hover:border-slate-200 transition-all flex items-start gap-2 group"
                >
                  <span class="font-bold text-blue-600 whitespace-nowrap">${SCORE_RANGES[t.rangeIdx]?.label.split(' <= ')[0] || ''}..</span>
                  <span class="text-slate-600 truncate">${t.comment}</span>
                </button>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nội dung nhận xét</label>
            <textarea id="bulk-comment" class="swal2-textarea !m-0 !w-full" placeholder="Nhập nội dung nhận xét..."></textarea>
            <label class="flex items-center gap-2 mt-2 cursor-pointer group">
              <input type="checkbox" id="bulk-save-template" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500">
              <span class="text-xs text-slate-600 group-hover:text-blue-600 transition-colors">Lưu vào danh mục nhận xét của tôi</span>
            </label>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cập nhật',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const rangeIdx = parseInt((document.getElementById('bulk-range') as HTMLSelectElement).value);
        const target = (document.getElementById('bulk-target') as HTMLSelectElement).value;
        const comment = (document.getElementById('bulk-comment') as HTMLTextAreaElement).value;
        const saveTemplate = (document.getElementById('bulk-save-template') as HTMLInputElement).checked;
        if (!comment) Swal.showValidationMessage('Vui lòng nhập nội dung nhận xét');
        return { range: SCORE_RANGES[rangeIdx], rangeIdx, target, comment, saveTemplate };
      }
    }).then(result => {
      if (result.isConfirmed) {
        const { range, rangeIdx, target, comment, saveTemplate } = result.value;
        
        setData(prev => {
          const newGrades = { ...prev.grades };
          let newSettings = { ...prev.settings };

          // Lưu template nếu được chọn
          if (saveTemplate) {
            const existing = newSettings.commentTemplates || [];
            if (!existing.find(e => e.comment === comment && e.rangeIdx === rangeIdx)) {
              newSettings.commentTemplates = [...existing, { rangeIdx, comment }];
            }
          }
          
          // Xác định các lớp cần áp dụng
          let targetClasses = [selectedClassId];
          if (target === 'grade') {
            targetClasses = prev.classes.filter(c => c.gradeLevel === activeClass?.gradeLevel).map(c => c.id);
          } else if (target === 'all') {
            targetClasses = prev.classes.map(c => c.id);
          }

          targetClasses.forEach(cId => {
            const key = `${selectedYear}_${selectedSemester}_${selectedSubject}_${cId}`;
            const classGrades = [...(newGrades[key] || [])];
            const students = prev.students[cId] || [];

            students.forEach(s => {
              const gIdx = classGrades.findIndex(g => g.studentId === s.id);
              const g = gIdx !== -1 ? classGrades[gIdx] : { studentId: s.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 };
              const avg = calculateAverage(g);
              
              if (avg >= range.min && avg <= range.max) {
                if (gIdx !== -1) {
                  classGrades[gIdx] = { ...g, manualComment: comment };
                } else {
                  classGrades.push({ ...g, manualComment: comment });
                }
              }
            });
            newGrades[key] = classGrades;
          });
          
          return { ...prev, grades: newGrades, settings: newSettings };
        });
        Swal.fire('Thành công', 'Đã cập nhật nhận xét thành công!', 'success');
      }
    });
  };

  const handlePasteToColumn = (colId: string) => {
    Swal.fire({
      title: `Dán dữ liệu cho cột ${colId.toUpperCase()}`,
      html: `
        <p class="text-[11px] text-slate-500 mb-2">Mỗi giá trị một dòng theo đúng thứ tự danh sách lớp.</p>
        <textarea id="paste-input" class="swal2-textarea !m-0 !w-full !h-48 text-sm" placeholder="Dán dữ liệu từ Excel..."></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Thực hiện',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        return (document.getElementById('paste-input') as HTMLTextAreaElement).value;
      }
    }).then(result => {
      if (result.isConfirmed && result.value) {
        const rows = result.value.split('\n').map(r => r.trim()).filter(r => r !== '');
        
        if (['name', 'code', 'birthday', 'gender'].includes(colId)) {
          setData(prev => {
            const newStudents = [...(prev.students[selectedClassId] || [])];
            rows.forEach((val, idx) => {
              if (newStudents[idx]) {
                const key = colId === 'name' ? 'name' : (colId === 'code' ? 'code' : (colId === 'birthday' ? 'birthday' : 'gender'));
                newStudents[idx] = { ...newStudents[idx], [key]: val };
              }
            });
            return { ...prev, students: { ...prev.students, [selectedClassId]: newStudents } };
          });
          Swal.fire('Thành công', `Đã cập nhật thông tin học sinh cho ${rows.length} dòng.`, 'success');
        } else {
          setDraftGrades(prev => {
            const newDraft = { ...prev };
            classStudents.forEach((s, idx) => {
              if (rows[idx]) {
                newDraft[s.id] = { ...(newDraft[s.id] || {}), [colId]: rows[idx] };
              }
            });
            return newDraft;
          });
          Swal.fire('Thành công', `Đã nhập nháp ${rows.length} giá trị cho cột ${colId.toUpperCase()}. Nhớ nhấn "Lưu điểm" để hoàn tất.`, 'success');
        }
      }
    });
  };

  const handleArchiveTerm = () => {
    Swal.fire({
      title: 'Chốt điểm kỳ học?',
      text: 'Hệ thống sẽ lưu lại bản sao điểm Cộng, Trừ, Ròng và ĐTB hiện tại của toàn bộ học sinh để phục vụ báo cáo tổng kết. Bản sao này sẽ được lưu giữ độc lập.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Đồng ý chốt',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#3b82f6'
    }).then(result => {
      if (result.isConfirmed) {
        setData(prev => {
          const archived = { ...(prev.archivedGrades || {}) };
          const archiveKey = `${selectedYear}_${selectedSemester}_${selectedSubject}_${selectedClassId}`;
          archived[archiveKey] = JSON.parse(JSON.stringify(prev.grades[gradeKey] || []));
          return { ...prev, archivedGrades: archived };
        });
        Swal.fire('Thành công', 'Đã lưu trữ dữ liệu chốt kỳ học!', 'success');
      }
    });
  };

  const handlePasteStudents = () => {
    if (!activeClass) {
      Swal.fire('Lỗi', 'Vui lòng chọn một lớp học', 'error');
      return;
    }
    Swal.fire({
      title: 'Dán danh sách học sinh',
      html: `
        <div class="text-left text-sm text-slate-500 mb-2">
          Copy một cột chứa tên học sinh (từ Excel, Word, Notepad...) và dán vào ô dưới đây. Mỗi dòng là một học sinh. Giới tính mặc định là Nam (có thể sửa sau).
        </div>
        <textarea id="swal-paste-students" class="w-full h-48 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Nguyễn Văn A\nTrần Thị B\n..."></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Thêm danh sách',
      cancelButtonText: 'Hủy',
      width: '500px',
      preConfirm: () => {
        const text = (document.getElementById('swal-paste-students') as HTMLTextAreaElement).value;
        if (!text.trim()) {
          Swal.showValidationMessage('Vui lòng dán nội dung vào ô trống');
        }
        return text;
      }
    }).then(result => {
      if (result.isConfirmed && result.value) {
        const lines = result.value.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        
        if (lines.length === 0) return;

        const newStudents: Student[] = [];

        lines.forEach((name: string, index: number) => {
          const studentId = `s_${Date.now()}_${index}`;
          newStudents.push({ id: studentId, name, gender: 'Nam' });
        });

        setData(prev => ({
          ...prev,
          students: { ...prev.students, [selectedClassId]: [...(prev.students[selectedClassId] || []), ...newStudents] }
        }));
        Swal.fire('Thành công', `Đã thêm ${newStudents.length} học sinh!`, 'success');
      }
    });
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
          const gradesArray = prev.grades[gradeKey] || [];
          const newGrades = gradesArray.map(grade => {
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
            grades: { ...prev.grades, [gradeKey]: newGrades }
          };
        });
        Swal.fire('Thành công', 'Đã chốt kỳ và lưu lịch sử!', 'success');
      } else if (result.isDenied) {
        setData(prev => {
          const gradesArray = prev.grades[gradeKey] || [];
          const newGrades = gradesArray.map(grade => ({
            ...grade,
            bonusTotal: 0,
            penaltyTotal: 0
          }));
          return { ...prev, grades: { ...prev.grades, [gradeKey]: newGrades } };
        });
        Swal.fire('Đã xóa', 'Dữ liệu nháp đã được reset về 0.', 'info');
      }
    });
  };

  const openScoreEditModal = (student: Student, type: 'oral' | 'm15' | 'h1' | 'semester', typeName: string, currentValue: number | null, index?: number) => {
    const historyRows = data.history
      .filter(h => h.studentId === student.id && h.type === typeName)
      .map(h => `
        <tr class="border-b border-slate-100">
          <td class="py-2 text-xs text-slate-500">${dayjs(h.timestamp).format('HH:mm DD/MM')}</td>
          <td class="py-2 text-xs text-center line-through text-rose-400">${h.oldValue}</td>
          <td class="py-2 text-xs text-center font-bold text-emerald-600">${h.newValue}</td>
        </tr>
      `).join('');

    const historyHTML = historyRows ? `
      <div class="mt-4 border-t border-slate-200 pt-4">
        <p class="text-sm font-bold text-slate-700 mb-2 text-left flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg> Lịch sử thay đổi (${typeName}):</p>
        <div class="max-h-32 overflow-y-auto pr-2 custom-scrollbar">
          <table class="w-full text-left">
            <thead class="sticky top-0 bg-white">
              <tr>
                <th class="text-xs text-slate-400 font-medium pb-2">Thời gian</th>
                <th class="text-xs text-slate-400 font-medium pb-2 text-center">Cũ</th>
                <th class="text-xs text-slate-400 font-medium pb-2 text-center">Mới</th>
              </tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    ` : `<div class="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-400 flex flex-col items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-50"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Chưa có lịch sử thay đổi</div>`;

    Swal.fire({
      title: `Điểm ${typeName}`,
      html: `
        <div class="text-left mb-3 text-sm text-slate-600">Học sinh: <span class="font-bold text-slate-800">${student.name}</span></div>
        <input id="swal-edit-score" type="number" class="swal2-input !mt-0" value="${currentValue !== null ? currentValue : ''}" min="0" max="10" step="0.1" placeholder="Nhập điểm...">
        ${historyHTML}
      `,
      showCancelButton: true,
      showDenyButton: currentValue !== null,
      confirmButtonText: currentValue !== null ? 'Cập nhật' : 'Thêm điểm',
      denyButtonText: 'Xóa điểm',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const val = (document.getElementById('swal-edit-score') as HTMLInputElement).value;
        if (!val && currentValue === null) return false;
        return val;
      }
    }).then(result => {
      if (result.isConfirmed) {
        const newVal = parseFloat(result.value);
        if (isNaN(newVal)) return;

        const grade = classGrades.find(g => g.studentId === student.id);
        if (!grade) return;

        if (type === 'semester') {
          handleUpdateGrade(student.id, 'semester', newVal);
        } else {
          const currentArr = [...grade[type]];
          if (index !== undefined) {
            currentArr[index] = newVal;
          } else {
            currentArr.push(newVal);
          }
          handleUpdateGrade(student.id, type, currentArr);
        }
      } else if (result.isDenied && currentValue !== null) {
        const grade = classGrades.find(g => g.studentId === student.id);
        if (!grade) return;

        if (type === 'semester') {
          handleUpdateGrade(student.id, 'semester', null as any);
        } else {
          if (index !== undefined) {
            const newArr = grade[type].filter((_, i) => i !== index);
            handleUpdateGrade(student.id, type, newArr);
          }
        }
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
        // Lưu vào state để có thể xuất Excel
        setData(prev => {
          const gradesArray = prev.grades[gradeKey] || [];
          const index = gradesArray.findIndex(g => g.studentId === student.id);
          let newGrades = [...gradesArray];
          if (index !== -1) {
            newGrades[index] = { ...newGrades[index], aiAnalysis: res };
          } else {
            newGrades.push({ studentId: student.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0, aiAnalysis: res });
          }
          return { ...prev, grades: { ...prev.grades, [gradeKey]: newGrades } };
        });

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

  const handleBatchAnalyze = async () => {
    if (!activeClass || classStudents.length === 0) return;
    
    if (!data.settings.geminiApiKey) {
      Swal.fire('Lỗi', 'Vui lòng cấu hình Gemini API Key trong phần Cài đặt', 'error');
      return;
    }

    const { isConfirmed } = await Swal.fire({
      title: 'Phân tích toàn bộ lớp?',
      text: `Hệ thống sẽ thực hiện ${classStudents.length} lượt phân tích AI. Quá trình này có thể mất vài phút.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Bắt đầu',
      cancelButtonText: 'Hủy'
    });

    if (!isConfirmed) return;

    setIsAiLoading(true);
    let successCount = 0;

    try {
      for (const student of classStudents) {
        const grade = (data.grades[gradeKey] || []).find(g => g.studentId === student.id);
        const gData = grade || { studentId: student.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 };
        
        const prompt = PROMPTS.analyzeStudent(student.name, {
          ...gData,
          average: calculateAverage(gData)
        });

        const res = await callGeminiAI(prompt);
        if (res) {
          setData(prev => {
            const gradesArray = prev.grades[gradeKey] || [];
            const index = gradesArray.findIndex(g => g.studentId === student.id);
            let newGrades = [...gradesArray];
            if (index !== -1) {
              newGrades[index] = { ...newGrades[index], aiAnalysis: res };
            } else {
              newGrades.push({ ...gData, aiAnalysis: res });
            }
            return { ...prev, grades: { ...prev.grades, [gradeKey]: newGrades } };
          });
          successCount++;
        }
      }
      Swal.fire('Hoàn thành', `Đã phân tích xong ${successCount}/${classStudents.length} học sinh!`, 'success');
    } catch (error) {
      console.error(error);
      Swal.fire('Lỗi', 'Có lỗi xảy ra trong quá trình phân tích hàng loạt', 'error');
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
              <button 
                onClick={() => setActiveTab('templates')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'templates' ? 'bg-blue-50 text-blue-600 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <ClipboardList size={20} />
                <span>Danh mục nhận xét</span>
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sổ điểm lớp</p>
              <button 
                onClick={() => {
                  Swal.fire({
                    title: 'Thêm lớp học mới',
                    html: `
                      <input id="swal-class-name" class="swal2-input" placeholder="Tên lớp (VD: 9A1)">
                      <input id="swal-class-grade" class="swal2-input" placeholder="Khối (VD: 6, 7, 8, 9)">
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Thêm lớp',
                    cancelButtonText: 'Hủy',
                    preConfirm: () => {
                      const name = (document.getElementById('swal-class-name') as HTMLInputElement).value;
                      const grade = (document.getElementById('swal-class-grade') as HTMLInputElement).value;
                      if (!name) {
                        Swal.showValidationMessage('Vui lòng nhập tên lớp');
                      }
                      return { name, grade };
                    }
                  }).then((result) => {
                    if (result.isConfirmed) {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setData(prev => {
                        const newClasses = [...prev.classes, { id: newId, name: result.value.name, gradeLevel: result.value.grade, subject: '' }]
                          .sort((a, b) => (a.gradeLevel || '').localeCompare(b.gradeLevel || '') || a.name.localeCompare(b.name));
                        return {
                          ...prev,
                          classes: newClasses,
                          students: { ...prev.students, [newId]: [] },
                          grades: { ...prev.grades, [newId]: [] }
                        };
                      });
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
            <div className="space-y-4">
              {Object.entries(data.classes.reduce((acc, cls) => {
                const grade = cls.gradeLevel || 'Khác';
                if (!acc[grade]) acc[grade] = [];
                acc[grade].push(cls);
                return acc;
              }, {} as Record<string, ClassRoom[]>)).sort(([a], [b]) => a.localeCompare(b)).map(([grade, classes]) => (
                <div key={grade} className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1">Khối {grade}</p>
                  {classes.map(cls => (
                <div key={cls.id} className="relative group">
                  <button
                    onClick={() => { 
                      setSelectedClassId(cls.id); 
                      setActiveTab('grading');
                      setData(prev => ({ ...prev, settings: { ...prev.settings, lastClassId: cls.id } }));
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition-all pr-8 ${selectedClassId === cls.id ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${selectedClassId === cls.id ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                      <span className="truncate">{cls.name}</span>
                    </div>
                  </button>
                  {selectedClassId === cls.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        Swal.fire({
                          title: 'Chỉnh sửa lớp học',
                          html: `
                            <input id="swal-edit-name" class="swal2-input" value="${cls.name}" placeholder="Tên lớp">
                            <input id="swal-edit-grade" class="swal2-input" value="${cls.gradeLevel || ''}" placeholder="Khối">
                          `,
                          showCancelButton: true,
                          showDenyButton: true,
                          confirmButtonText: 'Lưu',
                          denyButtonText: 'Xóa lớp',
                          cancelButtonText: 'Hủy',
                          denyButtonColor: '#ef4444',
                          preConfirm: () => {
                            const name = (document.getElementById('swal-edit-name') as HTMLInputElement).value;
                            const grade = (document.getElementById('swal-edit-grade') as HTMLInputElement).value;
                            if (!name) Swal.showValidationMessage('Vui lòng nhập tên lớp');
                            return { name, grade };
                          }
                        }).then((result) => {
                          if (result.isConfirmed) {
                            setData(prev => {
                              const newClasses = prev.classes.map(c => c.id === cls.id ? { ...c, name: result.value.name, gradeLevel: result.value.grade } : c)
                                .sort((a, b) => (a.gradeLevel || '').localeCompare(b.gradeLevel || '') || a.name.localeCompare(b.name));
                              return { ...prev, classes: newClasses };
                            });
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
            <p className="text-slate-500 text-sm">Chào mừng, {data.settings.teacherName ? `giáo viên ${data.settings.teacherName}` : 'giáo viên'}! Hôm nay là {dayjs().format('DD/MM/YYYY')}</p>
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
                {Object.keys(draftGrades).length > 0 && (
                  <button onClick={handleSaveDrafts} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md animate-pulse">
                    <Save size={18} />
                    <span className="hidden sm:inline">Lưu điểm</span>
                  </button>
                )}
                <button onClick={handleCloseMonth} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <CalendarCheck size={18} />
                  <span className="hidden sm:inline">Chốt kỳ</span>
                </button>
                <button onClick={handleBatchAnalyze} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <BrainCircuit size={18} />
                  <span className="hidden sm:inline">Phân tích lớp (AI)</span>
                </button>
                <button onClick={handleBulkComment} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
                  <ClipboardList size={18} />
                  <span className="hidden sm:inline">Nhập nhận xét</span>
                </button>
                <button onClick={handlePasteStudents} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <ClipboardList size={18} />
                  <span className="hidden sm:inline">Dán danh sách</span>
                </button>
                <button onClick={exportToWord} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <Download size={18} />
                  <span className="hidden sm:inline">Xuất Word (AI)</span>
                </button>
                <button onClick={handleConfigColumns} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
                  <SettingsIcon size={18} />
                  <span className="hidden sm:inline">Cấu hình cột</span>
                </button>
                <button onClick={exportExcel} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md">
                  <Upload size={18} />
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
              {/* Context Selectors */}
              <div className="flex flex-wrap gap-3 bg-white p-4 rounded-2xl border border-slate-200 card-shadow items-center">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-slate-600">Năm học:</label>
                  <select 
                    value={selectedYear} 
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedYear(val);
                      setData(prev => ({ ...prev, settings: { ...prev.settings, lastYear: val } }));
                    }}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <label className="text-sm font-semibold text-slate-600">Học kỳ:</label>
                  <select 
                    value={selectedSemester} 
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedSemester(val);
                      setData(prev => ({ ...prev, settings: { ...prev.settings, lastSemester: val } }));
                    }}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {AVAILABLE_SEMESTERS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <label className="text-sm font-semibold text-slate-600">Môn học:</label>
                  <select 
                    value={selectedSubject} 
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedSubject(val);
                      setData(prev => ({ ...prev, settings: { ...prev.settings, lastSubject: val } }));
                    }}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    {DEFAULT_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="ml-auto">
                  <button 
                    onClick={handleArchiveTerm}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-sm font-bold shadow-lg shadow-emerald-100"
                  >
                    <CheckCircle2 size={16} />
                    <span>Chốt điểm kỳ học</span>
                  </button>
                </div>
              </div>

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
                  {selectedSemester === 'CN' ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Họ và Tên</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">ĐTB Học kỳ I</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">ĐTB Học kỳ II</th>
                          {(data.settings.visibleColumns || []).includes('avg') && <th className="px-6 py-4 text-xs font-bold text-blue-600 uppercase text-center bg-blue-50/30">ĐTB Cả năm</th>}
                          {(data.settings.visibleColumns || []).includes('rank') && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-amber-600">Xếp hạng</th>}
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Xếp loại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((student) => {
                          const hk1Key = `${selectedYear}_HK1_${selectedSubject}_${selectedClassId}`;
                          const hk2Key = `${selectedYear}_HK2_${selectedSubject}_${selectedClassId}`;
                          const hk1Grade = (data.grades[hk1Key] || []).find(g => g.studentId === student.id);
                          const hk2Grade = (data.grades[hk2Key] || []).find(g => g.studentId === student.id);
                          
                          const avg1 = hk1Grade ? calculateAverage(hk1Grade) : 0;
                          const avg2 = hk2Grade ? calculateAverage(hk2Grade) : 0;
                          
                          let cnAvg = 0;
                          if (avg1 > 0 || avg2 > 0) cnAvg = Math.round(((avg1 + avg2 * 2) / 3) * 10) / 10;
                          const rank = getRank(cnAvg);

                          return (
                            <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${student.gender === 'Nam' ? 'bg-blue-400' : 'bg-rose-400'}`}>
                                    {student.name.charAt(0)}
                                  </div>
                                  <div className="leading-none group">
                                    <p 
                                      className="font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                                      onClick={() => setShowRankId(showRankId === student.id ? null : student.id)}
                                    >
                                      {student.name}
                                    </p>
                                    {showRankId === student.id && cnAvg > 0 && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider mt-1 inline-block ${rank.bg} ${rank.color}`}>
                                        {rank.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-semibold text-slate-600">{avg1 > 0 ? avg1 : '-'}</td>
                              <td className="px-6 py-4 text-center font-semibold text-slate-600">{avg2 > 0 ? avg2 : '-'}</td>
                              {(data.settings.visibleColumns || []).includes('avg') && <td className="px-6 py-4 text-center font-bold text-blue-600 bg-blue-50/30 text-lg">{cnAvg > 0 ? cnAvg : '-'}</td>}
                              {(data.settings.visibleColumns || []).includes('rank') && <td className="px-6 py-4 text-center font-bold text-amber-600 text-lg">{cnAvg > 0 ? cnRanks[student.id] : '-'}</td>}
                              <td className="px-6 py-4 text-center">
                                {cnAvg > 0 ? (
                                  <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase ${rank.bg} ${rank.color}`}>
                                    {rank.label}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase group">
                          <div className="flex items-center gap-1">
                            Họ và Tên
                            <button onClick={() => handlePasteToColumn('name')} title="Dán danh sách" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                              <Upload size={12} />
                            </button>
                          </div>
                        </th>
                        {(data.settings.visibleColumns || []).includes('code') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase group">
                             <div className="flex items-center gap-1">
                              Mã HS
                              <button onClick={() => handlePasteToColumn('code')} title="Dán danh sách" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('birthday') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase group">
                            <div className="flex items-center gap-1">
                              Ngày sinh
                              <button onClick={() => handlePasteToColumn('birthday')} title="Dán danh sách" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('gender') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase group">
                            <div className="flex items-center gap-1">
                              Nam/Nữ
                              <button onClick={() => handlePasteToColumn('gender')} title="Dán danh sách" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('tx1') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              TX1
                              <button onClick={() => handlePasteToColumn('tx1')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('tx2') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              TX2
                              <button onClick={() => handlePasteToColumn('tx2')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('tx3') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              TX3
                              <button onClick={() => handlePasteToColumn('tx3')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('tx4') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              TX4
                              <button onClick={() => handlePasteToColumn('tx4')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('h1') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              Giữa Kỳ
                              <button onClick={() => handlePasteToColumn('h1')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('semester') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center group">
                            <div className="flex items-center justify-center gap-1">
                              Cuối Kỳ
                              <button onClick={() => handlePasteToColumn('semester')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('bonus') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-emerald-600 bg-emerald-50/30 group">
                            <div className="flex items-center justify-center gap-1">
                              Cộng (+)
                              <button onClick={() => handlePasteToColumn('bonus')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('penalty') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-rose-600 bg-rose-50/30 group">
                            <div className="flex items-center justify-center gap-1">
                              Trừ (-)
                              <button onClick={() => handlePasteToColumn('penalty')} title="Dán cột điểm" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        {(data.settings.visibleColumns || []).includes('net') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-indigo-600 bg-indigo-50/30">Ròng</th>
                        )}
                        {(data.settings.visibleColumns || []).includes('avg') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center font-bold text-blue-600 bg-blue-50/30">ĐTB</th>
                        )}
                        {(data.settings.visibleColumns || []).includes('rank') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center text-amber-600">Hạng</th>
                        )}
                        {(data.settings.visibleColumns || []).includes('comment') && (
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase group">
                            <div className="flex items-center gap-1">
                              Nhận xét
                              <button onClick={() => handlePasteToColumn('manualComment')} title="Dán nhận xét" className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-600">
                                <Upload size={12} />
                              </button>
                            </div>
                          </th>
                        )}
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classStudents.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((student) => {
                        const grade = classGrades.find(g => g.studentId === student.id) || { studentId: student.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0 };
                        const edits = draftGrades[student.id] || {};
                        
                        // Merge edits for display
                        const displayGrade = {
                          ...grade,
                          bonusTotal: edits.bonusTotal !== undefined ? parseFloat(edits.bonusTotal) : grade.bonusTotal,
                          penaltyTotal: edits.penaltyTotal !== undefined ? parseFloat(edits.penaltyTotal) : grade.penaltyTotal,
                        };

                        const avg = calculateAverage(displayGrade);
                        const rank = getRank(avg);

                        return (
                          <motion.tr layout key={student.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${student.gender === 'Nam' ? 'bg-blue-400' : 'bg-rose-400'}`}>
                                  {student.name.charAt(0)}
                                </div>
                                <div className="leading-none group">
                                  <div className="flex items-center gap-2">
                                    <p 
                                      className="font-bold text-slate-900 group-hover:text-blue-600 cursor-pointer"
                                      onClick={() => setShowRankId(showRankId === student.id ? null : student.id)}
                                      title="Nhấn để xem xếp loại"
                                    >
                                      {student.name}
                                    </p>
                                    <button 
                                      className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        Swal.fire({
                                          title: 'Sửa thông tin học sinh',
                                          html: `
                                            <input id="swal-student-name" class="swal2-input" value="${student.name}" placeholder="Tên học sinh">
                                            <input id="swal-student-code" class="swal2-input" value="${student.code || ''}" placeholder="Mã học sinh">
                                            <input id="swal-student-birthday" class="swal2-input" type="date" value="${student.birthday || ''}" placeholder="Ngày sinh">
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
                                            const code = (document.getElementById('swal-student-code') as HTMLInputElement).value;
                                            const birthday = (document.getElementById('swal-student-birthday') as HTMLInputElement).value;
                                            const gender = (document.getElementById('swal-student-gender') as HTMLSelectElement).value as 'Nam' | 'Nữ';
                                            if (!name) Swal.showValidationMessage('Vui lòng nhập tên học sinh');
                                            return { name, code, birthday, gender };
                                          }
                                        }).then((res) => {
                                          if (res.isConfirmed) {
                                            setData(prev => {
                                              const newStudents = [...(prev.students[selectedClassId] || [])];
                                              const idx = newStudents.findIndex(s => s.id === student.id);
                                              if (idx !== -1) newStudents[idx] = { ...newStudents[idx], name: res.value.name, code: res.value.code, birthday: res.value.birthday, gender: res.value.gender };
                                              return { ...prev, students: { ...prev.students, [selectedClassId]: newStudents } };
                                            });
                                          }
                                        });
                                      }}
                                      title="Sửa thông tin"
                                    >
                                      <SettingsIcon size={14} />
                                    </button>
                                  </div>
                                  {showRankId === student.id && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider mt-1 inline-block ${rank.bg} ${rank.color}`}>
                                      {rank.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {(data.settings.visibleColumns || []).includes('code') && <td className="px-6 py-4 text-sm text-slate-500 font-mono">{student.code || '-'}</td>}
                            {(data.settings.visibleColumns || []).includes('birthday') && <td className="px-6 py-4 text-sm text-slate-500">{student.birthday || '-'}</td>}
                            {(data.settings.visibleColumns || []).includes('gender') && <td className="px-6 py-4 text-sm text-slate-500">{student.gender || '-'}</td>}
                            {/* TX1 */}
                            {(data.settings.visibleColumns || []).includes('tx1') && (
                              <td className="px-3 py-4 text-center">
                                <input 
                                  type="text"
                                  placeholder="-"
                                  value={draftGrades[student.id]?.tx1 !== undefined ? draftGrades[student.id].tx1 : (grade.oral[0] ?? '')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), tx1: e.target.value } }))}
                                  className={`w-12 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.tx1 !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-slate-200 focus:border-blue-500 text-slate-700 hover:border-slate-300'}`}
                                />
                              </td>
                            )}
                            {/* TX2 */}
                            {(data.settings.visibleColumns || []).includes('tx2') && (
                              <td className="px-3 py-4 text-center">
                                <input 
                                  type="text"
                                  placeholder="-"
                                  value={draftGrades[student.id]?.tx2 !== undefined ? draftGrades[student.id].tx2 : (grade.oral[1] ?? '')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), tx2: e.target.value } }))}
                                  className={`w-12 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.tx2 !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-slate-200 focus:border-blue-500 text-slate-700 hover:border-slate-300'}`}
                                />
                              </td>
                            )}
                            {/* TX3 */}
                            {(data.settings.visibleColumns || []).includes('tx3') && (
                              <td className="px-3 py-4 text-center">
                                <input 
                                  type="text"
                                  placeholder="-"
                                  value={draftGrades[student.id]?.tx3 !== undefined ? draftGrades[student.id].tx3 : (grade.m15[0] ?? '')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), tx3: e.target.value } }))}
                                  className={`w-12 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.tx3 !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-slate-200 focus:border-blue-500 text-slate-700 hover:border-slate-300'}`}
                                />
                              </td>
                            )}
                            {/* TX4 */}
                            {(data.settings.visibleColumns || []).includes('tx4') && (
                              <td className="px-3 py-4 text-center">
                                <input 
                                  type="text"
                                  placeholder="-"
                                  value={draftGrades[student.id]?.tx4 !== undefined ? draftGrades[student.id].tx4 : (grade.m15[1] ?? '')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), tx4: e.target.value } }))}
                                  className={`w-12 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.tx4 !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-slate-200 focus:border-blue-500 text-slate-700 hover:border-slate-300'}`}
                                />
                              </td>
                            )}
                            {/* Giữa kỳ */}
                            {(data.settings.visibleColumns || []).includes('h1') && (
                              <td className="px-6 py-4 text-center">
                                <input 
                                  type="text"
                                  value={draftGrades[student.id]?.h1 !== undefined ? draftGrades[student.id].h1 : grade.h1.join(' ')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), h1: e.target.value } }))}
                                  className={`w-16 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.h1 !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-indigo-200 focus:border-indigo-500 text-indigo-700 hover:border-indigo-300'}`}
                                />
                              </td>
                            )}
                            {/* Cuối Kỳ */}
                            {(data.settings.visibleColumns || []).includes('semester') && (
                              <td className="px-6 py-4 text-center">
                                <input 
                                  type="text"
                                  value={draftGrades[student.id]?.semester !== undefined ? draftGrades[student.id].semester : (grade.semester !== null ? grade.semester : '')}
                                  onChange={e => setDraftGrades(prev => ({ ...prev, [student.id]: { ...(prev[student.id] || {}), semester: e.target.value } }))}
                                  className={`w-12 text-center px-1 py-1.5 bg-transparent border-b-2 focus:outline-none transition-colors font-bold ${draftGrades[student.id]?.semester !== undefined ? 'border-rose-400 text-rose-600 bg-rose-50' : 'border-purple-200 focus:border-purple-500 text-purple-700 hover:border-purple-300'}`}
                                />
                              </td>
                            )}
                            {/* Điểm Cộng */}
                            {(data.settings.visibleColumns || []).includes('bonus') && (
                              <td className="px-6 py-4 text-center bg-emerald-50/10">
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`font-black text-emerald-600 text-sm ${edits.bonusTotal !== undefined ? 'animate-pulse' : ''}`}>+{displayGrade.bonusTotal || 0}</span>
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
                            )}
                            {/* Điểm Trừ */}
                            {(data.settings.visibleColumns || []).includes('penalty') && (
                              <td className="px-6 py-4 text-center bg-rose-50/10">
                                 <div className="flex flex-col items-center gap-1">
                                  <span className={`font-black text-rose-600 text-sm ${edits.penaltyTotal !== undefined ? 'animate-pulse' : ''}`}>-{displayGrade.penaltyTotal || 0}</span>
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
                            )}
                            {/* Điểm Ròng */}
                            {(data.settings.visibleColumns || []).includes('net') && (
                              <td className="px-6 py-4 text-center bg-indigo-50/20">
                                <span className={`text-sm font-bold ${((displayGrade.bonusTotal || 0) - (displayGrade.penaltyTotal || 0)) > 0 ? 'text-emerald-600' : ((displayGrade.bonusTotal || 0) - (displayGrade.penaltyTotal || 0)) < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {((displayGrade.bonusTotal || 0) - (displayGrade.penaltyTotal || 0)) > 0 ? '+' : ''}{(displayGrade.bonusTotal || 0) - (displayGrade.penaltyTotal || 0)}
                                </span>
                              </td>
                            )}
                            {/* ĐTB */}
                            {(data.settings.visibleColumns || []).includes('avg') && (
                              <td className="px-6 py-4 text-center bg-blue-50/20">
                                <span className={`text-lg font-black ${rank.color}`}>
                                  {avg || '0'}
                                </span>
                              </td>
                            )}
                            {/* Hạng */}
                            {(data.settings.visibleColumns || []).includes('rank') && (
                              <td className="px-6 py-4 text-center">
                                <span className="font-bold text-amber-600 text-lg">
                                  {avg > 0 ? normalRanks[student.id] : '-'}
                                </span>
                              </td>
                            )}
                            {/* Nhận xét */}
                            {(data.settings.visibleColumns || []).includes('comment') && (
                              <td className="px-6 py-4">
                                <textarea
                                  value={grade.manualComment || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setData(prev => {
                                      const newGrades = { ...prev.grades };
                                      const classGrades = [...(newGrades[gradeKey] || [])];
                                      const gIdx = classGrades.findIndex(g => g.studentId === student.id);
                                      if (gIdx !== -1) {
                                        classGrades[gIdx] = { ...classGrades[gIdx], manualComment: val };
                                      } else {
                                        classGrades.push({ studentId: student.id, oral: [], m15: [], h1: [], semester: null, bonusTotal: 0, penaltyTotal: 0, manualComment: val });
                                      }
                                      return { ...prev, grades: { ...prev.grades, [gradeKey]: classGrades } };
                                    });
                                  }}
                                  placeholder="..."
                                  className="w-48 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[40px] resize-y"
                                />
                              </td>
                            )}
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
                  )}
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
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Lịch sử thay đổi điểm</h2>
                  <p className="text-sm text-slate-500">Toàn bộ các thao tác chỉnh sửa điểm số được ghi lại tại đây</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={showDeletedHistory}
                      onChange={(e) => setShowDeletedHistory(e.target.checked)}
                    />
                    <span className="text-xs font-bold text-slate-600">Hiện bản ghi đã xóa</span>
                  </label>
                  <button 
                    onClick={() => {
                      Swal.fire({
                        title: 'Xóa vĩnh viễn?',
                        text: 'Tất cả các bản ghi lịch sử sẽ bị xóa sạch hoàn toàn.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#ef4444',
                        confirmButtonText: 'Xóa vĩnh viễn'
                      }).then(res => {
                        if (res.isConfirmed) {
                          setData(prev => ({ ...prev, history: [] }));
                          Swal.fire('Đã xóa', 'Lịch sử đã được dọn sạch.', 'success');
                        }
                      });
                    }}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                    title="Xóa vĩnh viễn toàn bộ lịch sử"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 card-shadow overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">Năm học:</label>
                      <select
                        value={historyFilterYear}
                        onChange={e => setHistoryFilterYear(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Tất cả</option>
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">Lớp:</label>
                      <select
                        value={historyFilterClass}
                        onChange={e => setHistoryFilterClass(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Tất cả</option>
                        {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">Thời gian</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Học sinh</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Loại điểm</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Giá trị cũ</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Giá trị mới</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const filtered = data.history.filter(h => {
                          const student = Object.values(data.students).flat().find(s => s.id === h.studentId);
                          const nameMatch = student?.name.toLowerCase().includes(searchQuery.toLowerCase());
                          const deleteMatch = showDeletedHistory ? true : !h.isDeleted;
                          return nameMatch && deleteMatch;
                        });

                        return filtered.map((item) => {
                          const student = Object.values(data.students).flat().find(s => s.id === item.studentId);
                          return (
                            <tr key={item.id} className={`group hover:bg-slate-50/50 transition-colors ${item.isDeleted ? 'bg-slate-50 opacity-60' : ''}`}>
                              <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                                {dayjs(item.timestamp).format('HH:mm - DD/MM/YYYY')}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${student?.gender === 'Nam' ? 'bg-blue-400' : 'bg-rose-400'}`}>
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
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {!item.isDeleted ? (
                                    <button 
                                      onClick={() => {
                                        setData(prev => ({
                                          ...prev,
                                          history: prev.history.map(h => h.id === item.id ? { ...h, isDeleted: true } : h)
                                        }));
                                      }}
                                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                      title="Tạm ẩn"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => {
                                          setData(prev => ({
                                            ...prev,
                                            history: prev.history.map(h => h.id === item.id ? { ...h, isDeleted: false } : h)
                                          }));
                                        }}
                                        className="text-[10px] font-bold text-emerald-600 hover:underline"
                                      >
                                        Khôi phục
                                      </button>
                                      <button 
                                        onClick={() => {
                                          setData(prev => ({
                                            ...prev,
                                            history: prev.history.filter(h => h.id !== item.id)
                                          }));
                                        }}
                                        className="text-[10px] font-bold text-rose-600 hover:underline ml-2"
                                      >
                                        Xóa hẳn
                                      </button>
                                    </>
                                  )}
                                </div>
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

          {activeTab === 'templates' && (
            <motion.div 
              key="templates"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Danh mục nhận xét</h2>
                  <p className="text-sm text-slate-500">Quản lý và áp dụng hàng loạt các mẫu nhận xét chuyên nghiệp</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      Swal.fire({
                        title: 'Thêm mẫu nhận xét mới',
                        html: `
                          <div class="text-left">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nội dung nhận xét</label>
                            <textarea id="tpl-comment" class="swal2-textarea !m-0 !w-full" placeholder="Nhập nội dung..."></textarea>
                            <label class="block text-xs font-bold text-slate-500 uppercase mt-4 mb-1">Khoảng điểm áp dụng</label>
                            <select id="tpl-range" class="swal2-select !m-0 !w-full">
                              ${SCORE_RANGES.map((r, i) => `<option value="${i}">${r.label}</option>`).join('')}
                            </select>
                          </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: 'Thêm mẫu',
                        cancelButtonText: 'Hủy',
                        preConfirm: () => {
                          const comment = (document.getElementById('tpl-comment') as HTMLTextAreaElement).value;
                          const rangeIdx = parseInt((document.getElementById('tpl-range') as HTMLSelectElement).value);
                          if (!comment) Swal.showValidationMessage('Vui lòng nhập nội dung');
                          return { comment, rangeIdx };
                        }
                      }).then(res => {
                        if (res.isConfirmed) {
                          setData(prev => ({
                            ...prev,
                            settings: {
                              ...prev.settings,
                              commentTemplates: [...(prev.settings.commentTemplates || []), { ...res.value, subject: selectedSubject, gradeLevel: activeClass?.gradeLevel }]
                            }
                          }));
                          Swal.fire('Thành công', 'Đã thêm mẫu nhận xét!', 'success');
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold shadow-lg shadow-blue-100"
                  >
                    <Plus size={18} /> Thêm mẫu mới
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 card-shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 w-10">
                          <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
                        </th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12 text-center">STT</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nội dung nhận xét</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Khoảng điểm</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Khối/Môn</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data.settings.commentTemplates || []).map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400 text-center font-mono">{idx + 1}</td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-700 font-medium leading-relaxed">{t.comment}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase">
                              {SCORE_RANGES[t.rangeIdx]?.label || 'Tùy chỉnh'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-500 uppercase">Khối {t.gradeLevel || '?'}</p>
                              <p className="text-[9px] text-slate-400 font-medium italic">{t.subject || 'Tất cả'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                               <button 
                                onClick={() => {
                                  setData(prev => ({
                                    ...prev,
                                    settings: {
                                      ...prev.settings,
                                      commentTemplates: prev.settings.commentTemplates?.filter((_, i) => i !== idx)
                                    }
                                  }));
                                }}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                title="Xóa mẫu"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!data.settings.commentTemplates || data.settings.commentTemplates.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-20 text-center text-slate-300 italic text-sm">
                            Danh mục nhận xét hiện đang trống. Hãy thêm mẫu mới hoặc lưu lại từ sổ điểm.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                  <h3 className="text-lg font-bold text-slate-900 mb-6">
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

              <div className="grid grid-cols-1 gap-8 mt-8">
                <div className="bg-white p-6 rounded-3xl border border-slate-100 card-shadow overflow-hidden">
                   <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Users size={20} className="text-blue-500" />
                    Bảng xếp hạng lớp: {activeClass?.name}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                          <th className="px-6 py-4 text-center w-20">Hạng</th>
                          <th className="px-6 py-4">Học sinh</th>
                          <th className="px-6 py-4 text-center">ĐTB</th>
                          <th className="px-6 py-4 text-center">Xếp loại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[...classStudents].map(s => {
                          const g = (data.grades[gradeKey] || []).find(grade => grade.studentId === s.id);
                          const avg = g ? calculateAverage(g) : 0;
                          return { ...s, avg };
                        }).sort((a, b) => b.avg - a.avg).map((s, idx) => {
                          const rank = getRank(s.avg);
                          return (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-amber-100 text-amber-600' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-50 text-orange-600' : 'text-slate-400'}`}>
                                  {idx + 1}
                                </div>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-900">{s.name}</td>
                              <td className="px-6 py-4 text-center font-bold text-blue-600 text-lg">{s.avg > 0 ? s.avg : '-'}</td>
                              <td className="px-6 py-4 text-center">
                                {s.avg > 0 ? (
                                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${rank.bg} ${rank.color}`}>
                                    {rank.label}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                      <h4 className="font-bold text-slate-900">Thông tin & API</h4>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Tên giáo viên (Hiển thị trên báo cáo)</label>
                      <input 
                        type="text" 
                        placeholder="VD: Nguyễn Văn A..."
                        value={data.settings.teacherName || ''}
                        onChange={(e) => setData(prev => ({ ...prev, settings: { ...prev.settings, teacherName: e.target.value } }))}
                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                      />

                      <label className="block text-sm font-semibold text-slate-700 mb-1">API Key Gemini</label>
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

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 mt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarCheck className="text-blue-500" size={20} />
                      <h4 className="font-bold text-slate-900">Quản lý Năm học</h4>
                    </div>
                    <p className="text-xs text-slate-500">Thêm năm học mới bắt đầu từ 2026-2027 trở đi</p>
                    <div className="flex flex-wrap gap-2">
                      {availableYears.map(year => (
                        <div key={year} className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium">
                          <span>{year}</span>
                          {!DEFAULT_YEARS.includes(year) && (
                            <button
                              onClick={() => setData(prev => ({ ...prev, settings: { ...prev.settings, schoolYears: (prev.settings.schoolYears || DEFAULT_YEARS).filter(y => y !== year) } }))}
                              className="ml-1 text-rose-400 hover:text-rose-600"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={async () => {
                          const { value: yr } = await Swal.fire({
                            title: 'Thêm năm học mới',
                            input: 'text',
                            inputLabel: 'Định dạng YYYY-YYYY (từ 2026-2027 trở đi)',
                            inputPlaceholder: 'VD: 2026-2027',
                            showCancelButton: true,
                            confirmButtonText: 'Thêm',
                            cancelButtonText: 'Hủy',
                            inputValidator: (v) => {
                              if (!v || !/^\d{4}-\d{4}$/.test(v)) return 'Sai định dạng YYYY-YYYY';
                              const startY = parseInt(v.split('-')[0]);
                              if (startY < 2026) return 'Chỉ thêm từ năm 2026-2027 trở đi';
                              if (availableYears.includes(v)) return 'Năm học này đã tồn tại';
                            }
                          });
                          if (yr) {
                            setData(prev => ({
                              ...prev,
                              settings: { ...prev.settings, schoolYears: [...(prev.settings.schoolYears || DEFAULT_YEARS), yr].sort() }
                            }));
                          }
                        }}
                        className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all"
                      >
                        <Plus size={14} /> Thêm năm
                      </button>
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
