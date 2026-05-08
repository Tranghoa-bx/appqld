import { GoogleGenAI } from "@google/genai";

const FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-flash'
];

export async function callGeminiAI(prompt: string): Promise<string | null> {
  // Lấy API key và Model từ localStorage trước, nếu không có thì dùng env/mặc định
  let apiKey = '';
  let selectedModel = 'gemini-3-flash-preview';
  try {
    const dataStr = localStorage.getItem('smartgrade_data');
    if (dataStr) {
      const data = JSON.parse(dataStr);
      if (data.settings?.geminiApiKey) {
        apiKey = data.settings.geminiApiKey;
      }
      if (data.settings?.modelName) {
        selectedModel = data.settings.modelName;
      }
    }
  } catch (e) {
    console.error('Error reading localStorage for API key', e);
  }

  if (!apiKey) {
    apiKey = import.meta.env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  }

  if (!apiKey) {
    return 'Lỗi: Vui lòng nhập GEMINI_API_KEY trong Cài đặt.';
  }

  const ai = new GoogleGenAI({ apiKey });

  let lastError: any = null;
  const modelsToTry = [selectedModel, ...FALLBACK_MODELS.filter(m => m !== selectedModel)];

  for (const model of modelsToTry) {
    try {
      console.log(`Đang thử gọi AI với model: ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      return response.text;
    } catch (error: any) {
      console.error(`Lỗi với model ${model}:`, error);
      lastError = error;
      // Nếu không phải lỗi hệ thống/quota, có thể thử model tiếp theo
      // 429 là RESOURCE_EXHAUSTED, ta nên thử model khác thay vì dừng lại ngay
    }
  }

  // Nếu tất cả model đều thất bại
  const errorMessage = lastError?.message || 'Không xác định';
  return `Lỗi AI: Tất cả các model đều thất bại. Chi tiết lỗi cuối cùng: ${errorMessage}`;
}

export const PROMPTS = {
  analyzeStudent: (name: string, data: any) => `
    Bạn là một trợ lý giáo dục chuyên nghiệp tại Việt Nam. 
    Hãy phân tích kết quả học tập của học sinh: ${name}.
    Dữ liệu điểm (JSON): ${JSON.stringify(data)}
    
    Yêu cầu:
    1. Nhận xét về học lực hiện tại (Khá, Giỏi, Trung bình, Yếu).
    2. Đánh giá sự tiến bộ hoặc sút giảm.
    3. Phân tích tác động của thái độ học tập (điểm thưởng/phạt).
    4. Đưa ra 3 lời khuyên cụ thể để học sinh cải thiện kết quả.
    
    Phản hồi bằng tiếng Việt, định dạng Markdown đẹp mắt.
  `
};

