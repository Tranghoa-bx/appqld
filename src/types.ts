/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Student {
  id: string;
  name: string;
  gender: 'Nam' | 'Nữ';
  birthday?: string;
}

export interface Grade {
  studentId: string;
  oral: number[]; // Điểm miệng
  m15: number[];  // Điểm 15 phút
  h1: number[];   // Điểm giữa kỳ (hệ số 2)
  semester: number | null; // Điểm cuối kỳ (hệ số 3)
  bonusTotal: number; // Tổng điểm cộng (mỗi lần +0.25)
  penaltyTotal: number; // Tổng điểm bị trừ (mỗi lần -0.25)
}

export interface ClassRoom {
  id: string;
  name: string;
  subject: string;
}

export interface HistoryRecord {
  id: string;
  studentId: string;
  timestamp: string;
  type: 'Miệng' | '15 Phút' | 'Giữa Kỳ' | 'Cuối Kỳ' | 'Cộng' | 'Trừ';
  oldValue: string;
  newValue: string;
}

export interface AppData {
  classes: ClassRoom[];
  students: { [classId: string]: Student[] };
  grades: { [classId: string]: Grade[] };
  history: HistoryRecord[];
  settings: {
    geminiApiKey: string;
    modelName: string;
    theme: 'light' | 'dark';
  };
}

export const SCORE_WEIGHTS = {
  oral: 1,
  m15: 1,
  h1: 2,
  semester: 3
};
