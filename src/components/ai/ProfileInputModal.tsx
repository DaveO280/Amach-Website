"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWalletService } from "@/hooks/useWalletService";
import type { NormalizedUserProfile } from "@/utils/userProfileUtils";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface ProfileInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    age: number;
    sex: "male" | "female";
    birthDate: string;
    heightFeet: number;
    heightInches: number;
    weight: number;
  }) => void;
  initialProfile?: NormalizedUserProfile | null;
}

export const ProfileInputModal: React.FC<ProfileInputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialProfile,
}) => {
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [feet, setFeet] = useState<string>("");
  const [inches, setInches] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const { isConnected, getDecryptedProfile, loadProfileFromBlockchain } =
    useWalletService();

  useEffect(() => {
    const populateFromWallet = async (): Promise<void> => {
      if (!isOpen || !isConnected) return;

      setIsLoading(true);
      try {
        await loadProfileFromBlockchain();
        const walletProfile = await getDecryptedProfile();

        if (
          walletProfile &&
          walletProfile.birthDate &&
          walletProfile.height &&
          walletProfile.weight &&
          walletProfile.sex
        ) {
          const birthDateValue = new Date(walletProfile.birthDate);
          const today = new Date();
          const ageYears = today.getFullYear() - birthDateValue.getFullYear();
          const monthDiff = today.getMonth() - birthDateValue.getMonth();
          const derivedAge =
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDateValue.getDate())
              ? ageYears - 1
              : ageYears;

          const totalInches = walletProfile.height;
          const derivedFeet = Math.floor(totalInches / 12);
          const derivedInches = totalInches % 12;

          const sexMapping: Record<string, "male" | "female"> = {
            M: "male",
            F: "female",
            Male: "male",
            Female: "female",
            male: "male",
            female: "female",
          };

          setAge(derivedAge.toString());
          setSex(sexMapping[walletProfile.sex] || "male");
          setFeet(derivedFeet.toString());
          setInches(derivedInches.toString());
          setWeight(walletProfile.weight.toString());
          setBirthDate(walletProfile.birthDate);

          console.log("✅ Auto-populated profile form from wallet data:", {
            age: derivedAge,
            sex: sexMapping[walletProfile.sex] || "male",
            height: `${derivedFeet}'${derivedInches}"`,
            weight: walletProfile.weight,
            birthDate: walletProfile.birthDate,
          });
        }
      } catch (error) {
        console.error("❌ Failed to populate form from wallet:", error);
      } finally {
        setIsLoading(false);
      }
    };

    populateFromWallet();
  }, [isOpen, isConnected, getDecryptedProfile, loadProfileFromBlockchain]);

  useEffect(() => {
    if (!isOpen || isConnected || !initialProfile) {
      return;
    }

    if (initialProfile.age !== undefined) {
      setAge(Math.round(initialProfile.age).toString());
    }
    if (initialProfile.sex === "female") {
      setSex("female");
    } else if (initialProfile.sex === "male") {
      setSex("male");
    }
    if (typeof initialProfile.heightIn === "number") {
      const totalInches = initialProfile.heightIn;
      const initFeet = Math.floor(totalInches / 12);
      const initInches = Math.round(totalInches % 12);
      setFeet(initFeet.toString());
      setInches(initInches.toString());
    } else if (typeof initialProfile.heightCm === "number") {
      const totalInches = initialProfile.heightCm / 2.54;
      const initFeet = Math.floor(totalInches / 12);
      const initInches = Math.round(totalInches % 12);
      setFeet(initFeet.toString());
      setInches(initInches.toString());
    }
    if (typeof initialProfile.weightLbs === "number") {
      setWeight(Math.round(initialProfile.weightLbs).toString());
    } else if (typeof initialProfile.weightKg === "number") {
      setWeight(Math.round(initialProfile.weightKg * 2.20462).toString());
    }
    if (initialProfile.birthDate) {
      setBirthDate(initialProfile.birthDate);
    }
  }, [initialProfile, isOpen, isConnected]);

  const handleSubmit = (): void => {
    if (!age || !feet || !inches || !weight || !birthDate) {
      return;
    }

    const ageNum = parseInt(age, 10);
    const feetNum = parseInt(feet, 10);
    const inchesNum = parseInt(inches, 10);
    const weightNum = parseFloat(weight);
    const birthDateValue = new Date(birthDate);

    if (
      Number.isNaN(ageNum) ||
      Number.isNaN(feetNum) ||
      Number.isNaN(inchesNum) ||
      Number.isNaN(weightNum) ||
      Number.isNaN(birthDateValue.getTime())
    ) {
      return;
    }

    onSubmit({
      age: ageNum,
      sex,
      birthDate,
      heightFeet: feetNum,
      heightInches: inchesNum,
      weight: weightNum,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full p-1 text-amber-900 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4 text-emerald-800">
          {isConnected
            ? "Your Profile Information"
            : "Enter Your Profile Information"}
        </h2>

        {isConnected && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-green-800 text-sm">
              {isLoading
                ? "Loading your profile from blockchain..."
                : "✅ Profile loaded from your wallet"}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="birthDate">Birth Date</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setBirthDate(e.target.value)
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              type="number"
              min="18"
              max="120"
              value={age}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAge(e.target.value)
              }
              placeholder="Enter your age"
            />
          </div>

          <div className="space-y-2">
            <Label>Sex</Label>
            <RadioGroup
              value={sex}
              onValueChange={(value: string) =>
                setSex(value as "male" | "female")
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male">Male</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female">Female</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Height</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="feet"
                  type="number"
                  min="4"
                  max="8"
                  value={feet}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFeet(e.target.value)
                  }
                  placeholder="Feet"
                />
              </div>
              <div className="flex-1">
                <Input
                  id="inches"
                  type="number"
                  min="0"
                  max="11"
                  value={inches}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInches(e.target.value)
                  }
                  placeholder="Inches"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weight">Weight (lbs)</Label>
            <Input
              id="weight"
              type="number"
              min="50"
              max="500"
              value={weight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setWeight(e.target.value)
              }
              placeholder="Enter your weight in pounds"
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={
              !age || !feet || !inches || !weight || !birthDate || isLoading
            }
          >
            {isLoading
              ? "Loading..."
              : isConnected
                ? "Use Wallet Data"
                : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileInputModal;
