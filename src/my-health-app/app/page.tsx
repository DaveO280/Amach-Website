"use client";

import React from 'react';
import HealthDataSelector from '../components/HealthDataSelector';

export default function Home() {
  return (
    <main className="min-h-screen bg-[linear-gradient(to_bottom_right,var(--warm-bg)_0%,white_50%,var(--primary-light)_100%)]">
      <div className="container mx-auto py-8">
        {/* Removed header content with "YOUR HEALTH, YOUR CHOICE" and tagline */}
        <HealthDataSelector />
      </div>
    </main>
  );
}