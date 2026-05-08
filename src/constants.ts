import { AppData } from './types';

export const INITIAL_DATA: AppData = {
  classes: [
    { id: '9a1', name: 'Lớp 9A1', subject: 'Toán học' },
    { id: '9a2', name: 'Lớp 9A2', subject: 'Ngữ văn' },
  ],
  students: {
    '9a1': [
      { id: 's1', name: 'Nguyễn Văn An', gender: 'Nam', birthday: '2010-05-15' },
      { id: 's2', name: 'Trần Thị Bình', gender: 'Nữ', birthday: '2010-08-20' },
      { id: 's3', name: 'Lê Hoàng Long', gender: 'Nam', birthday: '2010-12-01' },
      { id: 's4', name: 'Phạm Minh Châu', gender: 'Nữ', birthday: '2010-02-12' },
      { id: 's5', name: 'Hoàng Quốc Việt', gender: 'Nam', birthday: '2010-07-30' },
    ],
    '9a2': [
      { id: 's6', name: 'Đặng Thùy Chi', gender: 'Nữ', birthday: '2010-03-05' },
      { id: 's7', name: 'Vũ Minh Đức', gender: 'Nam', birthday: '2010-10-10' },
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
    theme: 'light'
  }
};
