/**
 * Performance Trend Engine (Module 12)
 * Tính toán Đường trung bình động (Moving Average - SMA), Phân tích Phong độ,
 * Vận tốc tăng trưởng, Chỉ số Ổn định (Consistency), và Dự báo điểm số kỳ vọng.
 */

export interface TrendSessionPoint {
  session: string;
  sessionFullName?: string;
  date?: string;
  hwScore: number | null;
  testScore: number | null;
  testSma3?: number | null;
  testSma5?: number | null;
  hwSma3?: number | null;
  benchmarkTarget?: number | null;
}

export type TrendStatusType =
  | 'breakthrough' // 🚀 Bứt phá mạnh mẽ
  | 'improving'    // 📈 Tiến bộ đều đặn
  | 'stable'       // ⚖️ Duy trì ổn định
  | 'declining'    // 📉 Có dấu hiệu sa sút
  | 'volatile';    // ⚠️ Dao động thất thường

export interface PerformanceInsights {
  // Điểm trung bình tổng quan
  avgTest: number;
  avgHw: number;
  latestTest: number | null;
  latestHw: number | null;

  // Trung bình động hiện tại
  currentTestSma3: number | null;
  currentTestSma5: number | null;

  // Xu hướng & Vận tốc
  trendStatus: TrendStatusType;
  trendTitle: string;
  trendDescription: string;
  velocityScore: number; // Chênh lệch SMA gần nhất so với giai đoạn trước (+/- điểm)

  // Độ ổn định & Biến động
  standardDeviation: number; // Độ lệch chuẩn (Sigma)
  consistencyLevel: 'Cao (Ổn định)' | 'Khá' | 'Thất thường (Dao động lớn)';
  consistencyColor: string;

  // Phân tích Lệch tương quan (BTVN vs Kiểm tra)
  gapAnalysis: {
    hasSignificantGap: boolean;
    gapType: 'hw_higher_than_test' | 'test_higher_than_hw' | 'balanced';
    gapDiff: number;
    gapDescription: string;
  };

  // Dự báo Điểm kỳ vọng buổi tiếp theo
  forecast: {
    expectedMin: number;
    expectedMax: number;
    expectedCenter: number;
    confidence: 'Cao' | 'Trung bình' | 'Cần thêm dữ liệu';
  };

  // Tiến độ mục tiêu
  targetVal: number;
  targetGap: number;
  targetPercent: number;
}

/**
 * Tính toán Simple Moving Average (SMA) cho một mảng số (bỏ qua null)
 */
export function calculateSMA(
  data: (number | null)[],
  windowSize: number
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    // Thu thập các giá trị hợp lệ trong cửa sổ trượt (tối đa windowSize giá trị gần nhất)
    const validScores: number[] = [];
    for (let j = i; j >= 0 && validScores.length < windowSize; j--) {
      if (data[j] !== null && typeof data[j] === 'number' && !isNaN(data[j]!)) {
        validScores.push(data[j]!);
      }
    }

    if (validScores.length === 0) {
      result.push(null);
    } else {
      const sum = validScores.reduce((acc, val) => acc + val, 0);
      const avg = parseFloat((sum / validScores.length).toFixed(2));
      result.push(avg);
    }
  }

  return result;
}

/**
 * Tính Độ lệch chuẩn (Standard Deviation - Sigma)
 */
export function calculateStandardDeviation(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((sum, val) => sum + val, 0) / scores.length;
  const variance =
    scores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    (scores.length - 1);
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

/**
 * Xử lý & Làm giàu dữ liệu biểu đồ với Moving Average & Target Benchmark
 */
export function generatePerformanceTrendSeries(
  rawHistory: {
    session: string;
    sessionFullName?: string;
    date?: string;
    hwScore: number | null;
    testScore: number | null;
  }[],
  targetScore: number = 8.0
): TrendSessionPoint[] {
  if (!rawHistory || rawHistory.length === 0) return [];

  const testScores = rawHistory.map((h) => h.testScore);
  const hwScores = rawHistory.map((h) => h.hwScore);

  const testSma3Series = calculateSMA(testScores, 3);
  const testSma5Series = calculateSMA(testScores, 5);
  const hwSma3Series = calculateSMA(hwScores, 3);

  return rawHistory.map((item, idx) => ({
    ...item,
    testSma3: testSma3Series[idx],
    testSma5: testSma5Series[idx],
    hwSma3: hwSma3Series[idx],
    benchmarkTarget: targetScore,
  }));
}

/**
 * Phân tích chuyên sâu Phong độ học tập cá nhân (Performance Insights)
 */
export function analyzePerformanceInsights(
  trendSeries: TrendSessionPoint[],
  targetScore: number = 8.0
): PerformanceInsights {
  const validTestScores = trendSeries
    .map((s) => s.testScore)
    .filter((s): s is number => s !== null && typeof s === 'number');

  const validHwScores = trendSeries
    .map((s) => s.hwScore)
    .filter((s): s is number => s !== null && typeof s === 'number');

  const avgTest =
    validTestScores.length > 0
      ? parseFloat(
          (
            validTestScores.reduce((a, b) => a + b, 0) /
            validTestScores.length
          ).toFixed(1)
        )
      : 0;

  const avgHw =
    validHwScores.length > 0
      ? parseFloat(
          (
            validHwScores.reduce((a, b) => a + b, 0) / validHwScores.length
          ).toFixed(1)
        )
      : 0;

  const latestTest =
    validTestScores.length > 0
      ? validTestScores[validTestScores.length - 1]
      : null;

  const latestHw =
    validHwScores.length > 0
      ? validHwScores[validHwScores.length - 1]
      : null;

  const lastPoint = trendSeries[trendSeries.length - 1];
  const currentTestSma3 = lastPoint?.testSma3 ?? null;
  const currentTestSma5 = lastPoint?.testSma5 ?? null;

  // 1. Độ lệch chuẩn & Ổn định
  const stdDev = calculateStandardDeviation(validTestScores);
  let consistencyLevel: 'Cao (Ổn định)' | 'Khá' | 'Thất thường (Dao động lớn)' =
    'Cao (Ổn định)';
  let consistencyColor = 'text-emerald-600 dark:text-emerald-400';

  if (stdDev >= 1.8) {
    consistencyLevel = 'Thất thường (Dao động lớn)';
    consistencyColor = 'text-rose-600 dark:text-rose-400';
  } else if (stdDev >= 1.0) {
    consistencyLevel = 'Khá';
    consistencyColor = 'text-amber-600 dark:text-amber-400';
  }

  // 2. Tính Vận tốc & Xu hướng (Velocity & Trend)
  let velocityScore = 0;
  let trendStatus: TrendStatusType = 'stable';
  let trendTitle = '⚖️ Duy trì ổn định';
  let trendDescription =
    'Điểm số duy trì đều đặn, phong độ giữ ở mức vững vàng.';

  if (validTestScores.length >= 2) {
    const recent3 = validTestScores.slice(-3);
    const early3 = validTestScores.slice(0, Math.min(3, validTestScores.length - 1));

    const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    const earlyAvg = early3.reduce((a, b) => a + b, 0) / early3.length;

    velocityScore = parseFloat((recentAvg - earlyAvg).toFixed(2));

    if (stdDev >= 2.0 && validTestScores.length >= 4) {
      trendStatus = 'volatile';
      trendTitle = '⚠️ Dao động thất thường';
      trendDescription =
        'Điểm số biến thiên biên độ rộng giữa các buổi, cần củng cố tâm lý phòng thi và kiến thức nền tảng.';
    } else if (velocityScore >= 1.5) {
      trendStatus = 'breakthrough';
      trendTitle = '🚀 Bứt phá mạnh mẽ';
      trendDescription = `Điểm trung bình động gần đây tăng vọt +${velocityScore}đ so với giai đoạn đầu.`;
    } else if (velocityScore >= 0.5) {
      trendStatus = 'improving';
      trendTitle = '📈 Tiến bộ đều đặn';
      trendDescription = `Xu hướng điểm đang phát triển tích cực (+${velocityScore}đ), các buổi gần đây cải thiện rõ rệt.`;
    } else if (velocityScore <= -1.2) {
      trendStatus = 'declining';
      trendTitle = '📉 Có dấu hiệu sa sút';
      trendDescription = `Phong độ gần đây sụt giảm ${velocityScore}đ so với trước. Cần rà soát ngay các chuyên đề bị hổng.`;
    } else {
      trendStatus = 'stable';
      trendTitle = '⚖️ Duy trì ổn định';
      trendDescription = 'Phong độ giữ ở mức ổn định, biên độ dao động trong tầm kiểm soát.';
    }
  }

  // 3. Phân tích Tương quan (Kiểm tra vs BTVN)
  const gapDiff = parseFloat(Math.abs(avgHw - avgTest).toFixed(1));
  let hasSignificantGap = false;
  let gapType: 'hw_higher_than_test' | 'test_higher_than_hw' | 'balanced' =
    'balanced';
  let gapDescription = 'Phong độ làm bài tập ở nhà và thi trực tiếp tương đồng.';

  if (avgHw >= 8.0 && avgTest > 0 && avgHw - avgTest >= 2.0) {
    hasSignificantGap = true;
    gapType = 'hw_higher_than_test';
    gapDescription =
      'BTVN đạt điểm cao nhưng điểm thi trên lớp thấp hơn đáng kể (lệch ≥ 2.0đ). Cần kiểm tra xem con có tự làm bài ở nhà hay gặp vấn đề tâm lý áp lực khi thi trực tiếp.';
  } else if (avgTest >= 8.0 && avgHw > 0 && avgTest - avgHw >= 2.0) {
    hasSignificantGap = true;
    gapType = 'test_higher_than_hw';
    gapDescription =
      'Tư duy làm bài thi tốt nhưng chưa chăm chỉ làm BTVN ở nhà. Cần đôn đốc kỷ luật nộp bài.';
  }

  // 4. Dự báo Điểm kỳ vọng (Forecast)
  let expectedCenter = avgTest;
  if (currentTestSma3 !== null && currentTestSma3 > 0) {
    // Kết hợp 65% SMA-3 và 35% Điểm tích lũy
    expectedCenter = parseFloat(
      (0.65 * currentTestSma3 + 0.35 * avgTest).toFixed(1)
    );
  }

  const margin = Math.max(0.5, Math.min(1.5, stdDev > 0 ? stdDev * 0.8 : 0.75));
  const expectedMin = parseFloat(Math.max(0, expectedCenter - margin).toFixed(1));
  const expectedMax = parseFloat(Math.min(10, expectedCenter + margin).toFixed(1));

  let confidence: 'Cao' | 'Trung bình' | 'Cần thêm dữ liệu' = 'Cao';
  if (validTestScores.length < 3) {
    confidence = 'Cần thêm dữ liệu';
  } else if (stdDev >= 1.5) {
    confidence = 'Trung bình';
  }

  // 5. Tiến độ mục tiêu
  const targetGap = parseFloat((avgTest - targetScore).toFixed(1));
  const targetPercent =
    targetScore > 0
      ? Math.min(100, Math.max(0, Math.round((avgTest / targetScore) * 100)))
      : 100;

  return {
    avgTest,
    avgHw,
    latestTest,
    latestHw,
    currentTestSma3,
    currentTestSma5,
    trendStatus,
    trendTitle,
    trendDescription,
    velocityScore,
    standardDeviation: stdDev,
    consistencyLevel,
    consistencyColor,
    gapAnalysis: {
      hasSignificantGap,
      gapType,
      gapDiff,
      gapDescription,
    },
    forecast: {
      expectedMin,
      expectedMax,
      expectedCenter,
      confidence,
    },
    targetVal: targetScore,
    targetGap,
    targetPercent,
  };
}
