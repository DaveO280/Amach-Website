export interface RawUserProfileInput {
  name?: string;
  birthDate?: string;
  age?: number;
  sex?: string;
  height?: number;
  heightCm?: number;
  heightIn?: number;
  weight?: number;
  weightKg?: number;
  weightLbs?: number;
}

export interface NormalizedUserProfile {
  name?: string;
  birthDate?: string;
  age?: number;
  sex?: string;
  heightCm?: number;
  heightIn?: number;
  weightKg?: number;
  weightLbs?: number;
  bmi?: number;
}

const CM_PER_INCH = 2.54;
const LBS_PER_KG = 2.20462;

export function calculateAgeFromBirthDate(
  birthDate?: string,
): number | undefined {
  if (!birthDate) {
    return undefined;
  }

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < parsed.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : undefined;
}

function normalizeHeight(input: RawUserProfileInput): {
  heightCm?: number;
  heightIn?: number;
} {
  if (typeof input.heightCm === "number" && input.heightCm > 0) {
    return {
      heightCm: input.heightCm,
      heightIn: input.heightCm / CM_PER_INCH,
    };
  }

  if (typeof input.heightIn === "number" && input.heightIn > 0) {
    return {
      heightIn: input.heightIn,
      heightCm: input.heightIn * CM_PER_INCH,
    };
  }

  if (typeof input.height === "number" && input.height > 0) {
    const h = input.height;

    if (h > 100) {
      return {
        heightCm: h,
        heightIn: h / CM_PER_INCH,
      };
    }

    if (h > 10) {
      return {
        heightIn: h,
        heightCm: h * CM_PER_INCH,
      };
    }

    return {
      heightCm: h * 100,
      heightIn: h * 39.3701,
    };
  }

  return {};
}

function normalizeWeight(input: RawUserProfileInput): {
  weightKg?: number;
  weightLbs?: number;
} {
  if (typeof input.weightKg === "number" && input.weightKg > 0) {
    return {
      weightKg: input.weightKg,
      weightLbs: input.weightKg * LBS_PER_KG,
    };
  }

  if (typeof input.weightLbs === "number" && input.weightLbs > 0) {
    return {
      weightLbs: input.weightLbs,
      weightKg: input.weightLbs / LBS_PER_KG,
    };
  }

  if (typeof input.weight === "number" && input.weight > 0) {
    const w = input.weight;
    if (w > 140) {
      return {
        weightLbs: w,
        weightKg: w / LBS_PER_KG,
      };
    }

    return {
      weightKg: w,
      weightLbs: w * LBS_PER_KG,
    };
  }

  return {};
}

export function normalizeUserProfile(
  input: RawUserProfileInput,
): NormalizedUserProfile {
  const normalized: NormalizedUserProfile = {};

  if (input.name) {
    normalized.name = input.name;
  }

  if (input.birthDate) {
    normalized.birthDate = input.birthDate;
    const derivedAge = calculateAgeFromBirthDate(input.birthDate);
    if (derivedAge !== undefined) {
      normalized.age = derivedAge;
    }
  }

  if (typeof input.age === "number" && input.age > 0) {
    normalized.age = input.age;
  }

  if (typeof input.sex === "string" && input.sex.trim()) {
    normalized.sex = input.sex.trim().toLowerCase();
  }

  const { heightCm, heightIn } = normalizeHeight(input);
  if (heightCm !== undefined) {
    normalized.heightCm = heightCm;
  }
  if (heightIn !== undefined) {
    normalized.heightIn = heightIn;
  }

  const { weightKg, weightLbs } = normalizeWeight(input);
  if (weightKg !== undefined) {
    normalized.weightKg = weightKg;
  }
  if (weightLbs !== undefined) {
    normalized.weightLbs = weightLbs;
  }

  if (normalized.heightCm && normalized.weightKg) {
    const heightMeters = normalized.heightCm / 100;
    if (heightMeters > 0) {
      normalized.bmi = normalized.weightKg / (heightMeters * heightMeters);
    }
  }

  return normalized;
}
