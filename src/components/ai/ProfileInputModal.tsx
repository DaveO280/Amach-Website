"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { X } from "lucide-react";
import { useState } from "react";

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
          Enter Your Profile Information
        </h2>

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
            disabled={!age || !feet || !inches || !weight}
          >
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileInputModal;
