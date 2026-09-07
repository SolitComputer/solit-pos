'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'loading' | 'popup' | 'result';

const LOADING_DURATION_MS = 2500;
const RESULT_DURATION_MS = 1800;

export default function SplashScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('loading');
  const [yesPos, setYesPos] = useState({ top: 55, left: 65 });

  useEffect(() => {
    const t = setTimeout(() => setStage('popup'), LOADING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (stage !== 'result') return;
    const t = setTimeout(() => router.push('/login'), RESULT_DURATION_MS);
    return () => clearTimeout(t);
  }, [stage, router]);

  const runAwayYesButton = () => {
    setYesPos({
      top: Math.random() * 60 + 15,
      left: Math.random() * 60 + 15,
    });
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern animate-grid-move opacity-[0.15]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute w-80 h-80 bg-indigo-500/15 rounded-full blur-3xl animate-pulse-slow-delayed translate-x-20" />
        <div className="absolute w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse-slow-delayed -translate-x-20" />
      </div>

      <div className="absolute inset-0 bg-radial-vignette pointer-events-none" />

      {stage === 'loading' && (
        <div className="text-center relative z-10 animate-fade-scale-in">
          <div className="px-10 py-10 rounded-3xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-2xl">
            <div className="relative w-28 h-28 mx-auto mb-2">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-cyan-400 animate-spin-slow blur-[3px] opacity-80" />
              <div className="absolute inset-[3px] rounded-2xl bg-slate-950 flex items-center justify-center overflow-hidden shadow-inner">
                <img
                  src="/assets/solit03.jpeg"
                  alt="Solit POS"
                  className="w-full h-full object-cover rounded-2xl animate-fade-scale"
                />
              </div>
              <div className="absolute inset-0 animate-orbit">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.8)] absolute -top-1 left-1/2 -translate-x-1/2" />
              </div>
            </div>

            <h1 className="text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-200 to-white bg-[length:200%_auto] animate-shimmer text-2xl font-bold mt-6 tracking-tight">
              Solit POS
            </h1>

            <p className="text-slate-400 text-sm mt-2 animate-fade-up-delayed">
              Inventory & Payment System
            </p>

            <div className="w-48 h-1 mx-auto mt-6 rounded-full bg-white/[0.06] overflow-hidden animate-fade-up-delayed">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 animate-progress-slide" />
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-4 animate-fade-up-delayed">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce-dot-delay-1" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce-dot-delay-2" />
            </div>
          </div>
        </div>
      )}

      {(stage === 'popup' || stage === 'result') && (
        <div className="relative z-20 w-[340px] max-w-[90vw] h-[240px] rounded-3xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] shadow-2xl flex flex-col items-center justify-center px-6 animate-fade-scale-in overflow-hidden">
          {stage === 'popup' ? (
            <>
              <p className="text-white text-lg font-semibold text-center mb-10">
                Apakah anda mau naik gaji?
              </p>

              <button
                type="button"
                onClick={() => setStage('result')}
                className="absolute bottom-7 left-7 px-5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
              >
                Tidak
              </button>

              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={runAwayYesButton}
                onTouchStart={runAwayYesButton}
                style={{ top: `${yesPos.top}%`, left: `${yesPos.left}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium transition-all duration-150 ease-out"
              >
                Iya
              </button>
            </>
          ) : (
            <p className="text-slate-300 text-center text-base animate-fade-up">
              Maaf anda kurang beruntung 😅
            </p>
          )}
        </div>
      )}

      <style>{`
        .bg-grid-pattern {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .bg-radial-vignette {
          background: radial-gradient(circle at center, transparent 0%, rgba(2,6,23,0.6) 100%);
        }

        @keyframes grid-move {
          from { background-position: 0 0, 0 0; }
          to { background-position: 40px 40px, 40px 40px; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
        @keyframes fade-scale {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-scale-in {
          from { opacity: 0; transform: scale(0.92) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(320%); }
        }
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }

        .animate-grid-move { animation: grid-move 3s linear infinite; }
        .animate-spin-slow { animation: spin-slow 3s linear infinite; }
        .animate-orbit { animation: orbit 2.5s linear infinite; }
        .animate-pulse-slow { animation: pulse-slow 5s ease-in-out infinite; }
        .animate-pulse-slow-delayed { animation: pulse-slow 5s ease-in-out infinite; animation-delay: 1.5s; }
        .animate-fade-scale { animation: fade-scale 0.6s ease-out forwards; }
        .animate-fade-scale-in { animation: fade-scale-in 0.5s ease-out forwards; }
        .animate-fade-up { animation: fade-up 0.6s ease-out 0.2s both; }
        .animate-fade-up-delayed { animation: fade-up 0.6s ease-out 0.4s both; }
        .animate-shimmer {
          background-size: 200% auto;
          animation: shimmer 3s linear infinite;
        }
        .animate-progress-slide { animation: progress-slide 1.8s ease-in-out infinite; }
        .animate-bounce-dot { animation: bounce-dot 1.2s ease-in-out infinite; }
        .animate-bounce-dot-delay-1 { animation: bounce-dot 1.2s ease-in-out infinite; animation-delay: 0.15s; }
        .animate-bounce-dot-delay-2 { animation: bounce-dot 1.2s ease-in-out infinite; animation-delay: 0.3s; }
      `}</style>
    </div>
  );
}