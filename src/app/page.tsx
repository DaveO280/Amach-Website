"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Menu, Wallet, Bot, Activity, Brain, Leaf, Lock } from 'lucide-react';
import circuitTree from '@/assets/circuit-tree.svg'

const MainPage = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeCard, setActiveCard] = useState(0);

  const cards = [
    {
      icon: Brain,
      title: "AI Integration",
      description: "Leveraging advanced AI to analyze health patterns and provide personalized insights"
    },
    {
      icon: Leaf,
      title: "Holistic Health",
      description: "Bridging traditional wisdom with modern health data analytics"
    },
    {
      icon: Lock,
      title: "Data Sovereignty",
      description: "Encrypted storage on IPFS with zkSync verification for complete data control"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveCard((current) => (current + 1) % cards.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [cards.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50">
      {/* Header */}
      <header className="border-b border-amber-100">
        <div className="container mx-auto py-4">
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-black text-emerald-900">Amach Health</h1>
                <span className="text-2xl font-normal italic text-emerald-900 hidden sm:inline-block">
                  - &ldquo;Driven by Data, Guided by Nature&rdquo;
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center justify-end w-1/2">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center space-x-16 ml-auto mr-16">
                  <a href="/mission" className="text-amber-900 hover:text-emerald-600">Mission</a>
                  <a href="/whitepaper" className="text-amber-900 hover:text-emerald-600">Whitepaper</a>
                </div>
                <div className="relative"
                  onMouseEnter={() => setIsMenuOpen(true)}
                  onMouseLeave={() => setIsMenuOpen(false)}
                >
                  <Button variant="outline" className="text-amber-900 hover:text-emerald-600">
                    <Wallet className="h-4 w-4 mr-2" />
                    Connect Wallet
                  </Button>
                  
                  <div className={`absolute top-full right-0 mt-2 w-48 bg-white rounded-md shadow-lg overflow-hidden transition-all duration-200 ease-in-out ${
                    isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
                  }`}>
                    <div className="py-1">
                      <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50">
                        <Activity className="h-4 w-4 mr-2" />
                        Dashboard
                      </a>
                      <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50">
                        <Bot className="h-4 w-4 mr-2" />
                        AI Agent
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </nav>

            {/* Mobile menu button */}
            <Button variant="outline" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side content */}
            <div className="space-y-6">
              <div className="text-sm font-semibold text-emerald-600 tracking-wide">
                YOUR HEALTH, YOUR CHOICE
              </div>
              <h2 className="text-4xl font-light text-amber-900 leading-relaxed">
                Amach — from the Gaelic word for &ldquo;outsider&rdquo; or &ldquo;rebellion&rdquo; — embodies our vision for healthcare transformation.
              </h2>
              <p className="text-xl text-amber-800/80 leading-relaxed">
                By capturing insights from medical diagnostics, wearable technologies, and traditional wellness metrics, we&apos;re building a future where health decisions are backed by both clinical evidence and generational wisdom.
              </p>
              <div className="flex flex-col items-center mt-8 space-y-4">
                <Button 
                  className="px-8 py-6 text-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-300 hover:scale-105"
                  onClick={() => window.location.href = '/learn'}
                >
                  Learn More
                </Button>
                <p className="text-sm text-amber-800/60">
                  For inquiries: <a href="mailto:amachhealth@gmail.com" className="text-emerald-600 hover:text-emerald-700 underline">amachhealth@gmail.com</a>
                </p>
              </div>
            </div>
            
            {/* Right side - Rotating cards */}
            <div className="relative h-[400px] w-full">
              {cards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-all duration-2000 ${
                      index === activeCard 
                        ? 'integrate z-10' 
                        : 'disintegrate z-0'
                    }`}
                  >
                    <Card className="h-full bg-white/90 border-none shadow-lg backdrop-blur-sm">
                      <CardContent className="p-8 flex flex-col items-center justify-center h-full">
                        <Icon className="h-16 w-16 text-emerald-600 mb-6" />
                        <h3 className="text-2xl font-semibold text-amber-900 mb-4">{card.title}</h3>
                        <p className="text-lg text-amber-800/80 text-center leading-relaxed">
                          {card.description}
                        </p>
                        <div className="mt-6 flex gap-2">
                          {cards.map((_, i) => (
                            <div
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
                                i === activeCard ? 'bg-emerald-600 w-4' : 'bg-emerald-200'
                              }`}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Add this before closing the main container */}
      <div className="mt-24 py-8 border-t border-emerald-100">
        <div className="text-center text-amber-800/60">
          <p className="text-sm">
            Contact us: <a href="mailto:amachhealth@gmail.com" className="text-emerald-600 hover:text-emerald-700">amachhealth@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainPage;






