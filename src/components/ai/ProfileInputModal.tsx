"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useZkSyncSsoWallet } from "@/hooks/useZkSyncSsoWallet";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface ProfileInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    age: number;
    sex: "male" | "female";
    height: number;
    weight: number;
  }) => void;
}

export const ProfileInputModal: React.FC<ProfileInputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [feet, setFeet] = useState<string>("");
  const [inches, setInches] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Get wallet data
  const { isConnected, getDecryptedProfile, loadProfileFromBlockchain } =
    useZkSyncSsoWallet();

  // Auto-populate form when modal opens and wallet is connected
  useEffect(() => {
    const populateFromWallet = async (): Promise<void> => {
      if (!isOpen || !isConnected) return;

      setIsLoading(true);
      try {
        // First try to load fresh data from blockchain
        await loadProfileFromBlockchain();

        // Get decrypted profile data
        const walletProfile = await getDecryptedProfile();

        if (
          walletProfile &&
          walletProfile.birthDate &&
          walletProfile.height &&
          walletProfile.weight &&
          walletProfile.sex
        ) {
          // Calculate age from birth date
          const birthDate = new Date(walletProfile.birthDate);
          const today = new Date();
          const ageYears = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          const age =
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
              ? ageYears - 1
              : ageYears;

          // Convert height from inches to feet and inches
          const totalInches = walletProfile.height;
          const feet = Math.floor(totalInches / 12);
          const inches = totalInches % 12;

          // Map sex values
          const sexMapping: Record<string, "male" | "female"> = {
            M: "male",
            F: "female",
            Male: "male",
            Female: "female",
            male: "male",
            female: "female",
          };

          // Populate form fields
          setAge(age.toString());
          setSex(sexMapping[walletProfile.sex] || "male");
          setFeet(feet.toString());
          setInches(inches.toString());
          setWeight(walletProfile.weight.toString());

          console.log("✅ Auto-populated profile form from wallet data:", {
            age,
            sex: sexMapping[walletProfile.sex] || "male",
            height: `${feet}'${inches}"`,
            weight: walletProfile.weight,
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

  const handleSubmit = (): void => {
    // Validate inputs
    if (!age || !feet || !inches || !weight) {
      return;
    }

    const ageNum = parseInt(age);
    const feetNum = parseInt(feet);
    const inchesNum = parseInt(inches);
    const weightNum = parseFloat(weight);

    if (
      isNaN(ageNum) ||
      isNaN(feetNum) ||
      isNaN(inchesNum) ||
      isNaN(weightNum)
    ) {
      return;
    }

    // Convert feet and inches to total height in feet
    const totalHeight = feetNum + inchesNum / 12;

    onSubmit({
      age: ageNum,
      sex,
      height: totalHeight,
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
            disabled={!age || !feet || !inches || !weight || isLoading}
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
