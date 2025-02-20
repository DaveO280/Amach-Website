"use client"

import React from 'react';
import { whitepaperContent } from '../content';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PrintWhitepaper() {
  const router = useRouter();
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 print:bg-white">
      {/* Navigation - hidden when printing */}
      <div className="fixed top-4 left-4 print:hidden">
        <Button 
          variant="ghost"
          onClick={() => router.back()}
          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Whitepaper
        </Button>
      </div>

      {/* Print instructions and button - hidden when printing */}
      <div className="fixed top-4 right-4 print:hidden">
        <div className="flex flex-col items-end gap-2">
          <div className="text-sm text-amber-800/60 text-right">
            <p>To save as PDF:</p>
            <p>1. Click Print below</p>
            <p>2. Select "Save as PDF" as destination</p>
            <p>3. Click Save</p>
          </div>
          <Button 
            onClick={handlePrint}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-12 bg-white print:p-0">
        {/* Cover page */}
        <div className="space-y-16 print:space-y-0">
          {/* Cover page */}
          <div className="mb-16 print:mb-0 print:h-screen print:flex print:flex-col print:justify-center text-center print:break-after-page">
            <h1 className="text-4xl font-black text-emerald-900 print:text-black mb-4">
              Amach Health
            </h1>
            <p className="text-2xl text-emerald-600 print:text-black italic">
              "Driven by Data, Guided by Nature"
            </p>
            <p className="mt-8 text-lg text-amber-800/80 print:text-black">
              Whitepaper v1.0
            </p>
          </div>

          {/* Main content */}
          {Object.values(whitepaperContent).map((content, index) => (
            <div key={index} className="relative print:break-after-page">
              <div 
                className="print:break-inside-avoid"
                dangerouslySetInnerHTML={{ __html: content }} 
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 