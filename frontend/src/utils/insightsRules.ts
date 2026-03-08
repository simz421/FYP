import type { Trend } from "./analytics";

type RuleInput = {
  sensorType: string;
  unit?: string;
  avg: number;
  min: number;
  max: number;
  changePct: number | null; // % change vs previous
  trend: Trend;
  anomalies: number;
};

type RuleOutput = {
  headline: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

function s(v: number, digits = 1) {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

// Basic unit mapping fallback if not supplied
export function defaultUnitForSensor(sensorType: string) {
  const t = sensorType.toLowerCase();
  if (t.includes("temp")) return "°C";
  if (t.includes("humid")) return "%";
  if (t.includes("moist")) return "%"; // many systems use %, some use raw ADC — you can customize later
  if (t === "ph") return "pH";
  if (t.includes("light")) return "lux";
  if (t.includes("ec")) return "mS/cm";
  return "";
}

export function generateSmartInsight(input: RuleInput): RuleOutput {
  const sensor = input.sensorType.toLowerCase();
  const unit = input.unit || defaultUnitForSensor(input.sensorType);

  // Helpers
  const rising = input.trend === "rising";
  const falling = input.trend === "falling";
  const changeBigUp = input.changePct !== null && input.changePct >= 10;
  const changeBigDown = input.changePct !== null && input.changePct <= -10;

  // Generic anomaly warning
  if (input.anomalies >= 2) {
    return {
      headline: "Unusual variation detected",
      message: `Multiple anomaly buckets were detected. This may indicate unstable conditions or sensor noise. Consider verifying sensor placement/calibration.`,
      severity: "warning",
    };
  }

  // -------------------------
  // TEMPERATURE RULES (°C)
  // -------------------------
  if (sensor.includes("temp")) {
    // Heuristic bands (can be tuned for your crops)
    if (input.avg >= 35) {
      return {
        headline: "Heat stress risk (very high temperature)",
        message: `Average temperature is ${s(input.avg)}${unit} with a ${rising ? "rising" : "non-rising"} trend. Consider increasing irrigation frequency and improving ventilation/shade to reduce crop stress.`,
        severity: "critical",
      };
    }

    if (input.avg >= 30) {
      return {
        headline: "Temperature is high",
        message: `Average temperature is ${s(input.avg)}${unit}. ${
          rising
            ? "Trend is rising, which may increase evaporation and stress."
            : ""
        } Monitor soil moisture closely and consider ventilation or shade control.`,
        severity: "warning",
      };
    }

    if (input.avg <= 10) {
      return {
        headline: "Temperature is very low",
        message: `Average temperature is ${s(input.avg)}${unit}. Low temperatures can slow growth. Consider greenhouse insulation or adjusting planting time.`,
        severity: "warning",
      };
    }

    if (changeBigUp) {
      return {
        headline: "Temperature increased significantly",
        message: `Average temperature increased by ${s(input.changePct!, 1)}% vs previous period. Check irrigation schedule and ensure adequate airflow to avoid heat buildup.`,
        severity: "warning",
      };
    }

    if (changeBigDown) {
      return {
        headline: "Temperature dropped significantly",
        message: `Average temperature decreased by ${s(Math.abs(input.changePct!), 1)}% vs previous period. Verify environmental controls and watch for cold stress.`,
        severity: "info",
      };
    }

    return {
      headline: "Temperature within normal range",
      message: `Average temperature is ${s(input.avg)}${unit} and conditions appear stable. Continue routine monitoring.`,
      severity: "info",
    };
  }

  // -------------------------
  // HUMIDITY RULES (%)
  // -------------------------
  if (sensor.includes("humid")) {
    if (input.avg >= 85) {
      return {
        headline: "High humidity (fungal risk)",
        message: `Average humidity is ${s(input.avg)}${unit}. High humidity can increase fungal disease risk. Improve airflow/ventilation and reduce overcrowding.`,
        severity: "warning",
      };
    }

    if (input.avg <= 30) {
      return {
        headline: "Low humidity (dry air)",
        message: `Average humidity is ${s(input.avg)}${unit}. Dry air may increase transpiration stress. Consider misting/irrigation adjustments if applicable.`,
        severity: "warning",
      };
    }

    if (rising && input.avg >= 75) {
      return {
        headline: "Humidity rising",
        message: `Humidity is rising and currently around ${s(input.avg)}${unit}. Watch for condensation and ensure airflow is sufficient.`,
        severity: "info",
      };
    }

    return {
      headline: "Humidity stable",
      message: `Average humidity is ${s(input.avg)}${unit}. Continue monitoring and maintain good airflow.`,
      severity: "info",
    };
  }

  // -------------------------
  // SOIL MOISTURE RULES (%)
  // -------------------------
  if (sensor.includes("moist")) {
    if (input.avg <= 20) {
      return {
        headline: "Soil moisture is low",
        message: `Average soil moisture is ${s(input.avg)}${unit}. ${
          falling ? "Trend is falling, indicating increasing deficit." : ""
        } Consider irrigation soon to avoid water stress.`,
        severity: "critical",
      };
    }

    if (input.avg <= 35 && falling) {
      return {
        headline: "Soil moisture declining",
        message: `Soil moisture is declining (avg ${s(input.avg)}${unit}). Consider scheduling irrigation before levels become critical.`,
        severity: "warning",
      };
    }

    if (input.avg >= 80) {
      return {
        headline: "Soil may be oversaturated",
        message: `Average soil moisture is ${s(input.avg)}${unit}. Oversaturation can reduce oxygen to roots. Check drainage and reduce irrigation if needed.`,
        severity: "warning",
      };
    }

    return {
      headline: "Soil moisture acceptable",
      message: `Average soil moisture is ${s(input.avg)}${unit}. Continue normal irrigation schedule and monitor trend changes.`,
      severity: "info",
    };
  }

  // -------------------------
  // pH RULES
  // -------------------------
  if (sensor === "ph" || sensor.includes("ph")) {
    if (input.avg < 5.5) {
      return {
        headline: "Soil pH is too acidic",
        message: `Average pH is ${s(input.avg, 2)}. Consider liming or adjusting nutrient solutions depending on crop requirements.`,
        severity: "warning",
      };
    }

    if (input.avg > 7.5) {
      return {
        headline: "Soil pH is too alkaline",
        message: `Average pH is ${s(input.avg, 2)}. Consider sulfur amendments or adjusting nutrient solution to improve uptake.`,
        severity: "warning",
      };
    }

    return {
      headline: "Soil pH acceptable",
      message: `Average pH is ${s(input.avg, 2)}. Continue monitoring to maintain optimal nutrient availability.`,
      severity: "info",
    };
  }

  // Fallback generic
  return {
    headline: "Sensor analysis",
    message: `Average is ${s(input.avg)} ${unit}. Trend is ${input.trend}.`,
    severity: "info",
  };
}
