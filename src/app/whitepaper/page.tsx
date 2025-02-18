"use client"

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

// Add this to your globals.css
const whitepaperStyles = `
  .whitepaper-content {
    @apply font-sans;
  }
  
  .main-title {
    @apply font-serif text-4xl font-bold text-emerald-800 mb-4;
  }
  
  .subtitle {
    @apply font-serif text-2xl text-emerald-800 italic mb-8;
  }
  
  .section {
    @apply mb-8;
  }
  
  .section h3 {
    @apply font-sans text-xl font-medium uppercase tracking-wide text-emerald-800 mb-3;
  }
  
  .section p {
    @apply text-amber-900/80 leading-relaxed mb-4;
  }
  
  .section ul, .section ol {
    @apply ml-6 mb-4;
  }
  
  .section li {
    @apply text-amber-900/80 mb-2;
  }
`;

interface WhitepaperContent {
  [key: number]: string;
}

const whitepaperContent: WhitepaperContent = {
  1: `
    <div class="whitepaper-content">
      <h1 class="main-title">Amach Health</h1>
      <h2 class="subtitle">Bridging Traditional Wisdom and Modern Healthcare Through Decentralized Data</h2>
      
      <div class="section">
        <h3>ABSTRACT</h3>
        <p>Amach Health is pioneering a revolutionary approach to healthcare by creating a decentralized infrastructure that integrates traditional healing wisdom with modern medical data analytics. Our platform leverages blockchain technology, privacy-preserving computation, and artificial intelligence to enable secure health data sharing while empowering users to maintain full control over their information.</p>
      </div>

      <div class="section">
        <h3>TABLE OF CONTENTS</h3>
        <ol>
          <li>Introduction</li>
          <li>Vision & Mission</li>
          <li>Technical Architecture</li>
          <li>Data Privacy & Security</li>
          <li>Platform Components</li>
          <li>Tokenomics</li>
          <li>Roadmap</li>
          <li>Conclusion</li>
        </ol>
      </div>
    </div>
  `,
  2: '', // Add placeholder for other pages
  3: '',
  4: '',
  5: '',
  6: '',
  7: ''
};

export default function WhitepaperPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 7;

  const sections = [
    { title: "Abstract & Contents", page: 1 },
    { title: "Introduction & Vision", page: 2 },
    { title: "Technical Architecture", page: 3 },
    { title: "Data Privacy & Platform Components", page: 4 },
    { title: "Tokenomics", page: 5 },
    { title: "Roadmap", page: 6 },
    { title: "Conclusion", page: 7 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      <div className="fixed top-4 right-4 lg:hidden z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="border-emerald-600">
              <Menu className="h-4 w-4 text-emerald-600" />
            </Button>
          </SheetTrigger>
          <SheetContent className="bg-gradient-to-br from-amber-50 via-white to-emerald-50">
            <nav className="flex flex-col gap-2 mt-4">
              {sections.map((section, index) => (
                <Button
                  key={index}
                  variant={currentPage === section.page ? "default" : "ghost"}
                  className={`justify-start font-serif text-emerald-900 hover:text-emerald-800 ${
                    currentPage === section.page ? 'bg-emerald-600 text-white' : ''
                  }`}
                  onClick={() => setCurrentPage(section.page)}
                >
                  {section.title}
                </Button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex w-72 h-screen bg-white/80 backdrop-blur-sm p-6 fixed border-r border-emerald-100">
          <nav className="flex flex-col gap-3 w-full">
            <div className="mb-8">
              <h2 className="text-2xl font-serif text-emerald-900 mb-2">Amach Health</h2>
              <p className="text-sm italic text-emerald-600">&ldquo;Driven by Data, Guided by Nature&rdquo;</p>
            </div>
            {sections.map((section, index) => (
              <Button
                key={index}
                variant={currentPage === section.page ? "default" : "ghost"}
                className={`justify-start font-serif text-emerald-900 hover:text-emerald-800 ${
                  currentPage === section.page ? 'bg-emerald-600 text-white' : ''
                }`}
                onClick={() => setCurrentPage(section.page)}
              >
                {section.title}
              </Button>
            ))}
            <div className="mt-auto">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-72 p-6">
          <div className="max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: whitepaperContent[currentPage] }} />
        </div>
      </div>
    </div>
  );
} 