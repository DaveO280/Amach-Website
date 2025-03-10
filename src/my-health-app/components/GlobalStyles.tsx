"use client";

import React from 'react';

export default function GlobalStyles() {
  return (
    <style jsx global>{`
      :root {
        --primary: #006B4F;
        --primary-light: #E8F5F0;
        --accent: #B25D42;
        --warm-bg: #FDF6E3;
        --text: #333333;
        --background: #f8f9fa;
      }
      
      .metric-card {
        padding: 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        transition: all 0.2s ease;
        cursor: pointer;
        text-align: center;
      }
      
      .file-input {
        width: 100%;
        padding: 0.5rem;
        border: 1px dashed var(--primary);
        border-radius: 0.5rem;
        background-color: var(--primary-light);
        color: var(--primary);
      }
      
      .btn-primary {
        padding: 0.75rem 1rem;
        background-color: var(--primary);
        color: white;
        border-radius: 0.5rem;
        font-weight: 500;
        transition: all 0.2s ease;
      }
      
      .btn-primary:hover:not(:disabled) {
        background-color: #005540;
      }
      
      .btn-primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    `}</style>
  );
}