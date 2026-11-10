import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';

// --- User Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDSGaKIxmb5dEKyxIO4A3XLSPrfDW93YUk",
  authDomain: "the-vault-93440.firebaseapp.com",
  projectId: "the-vault-93440",
  storageBucket: "the-vault-93440.firebasestorage.app",
  messagingSenderId: "451597152411",
  appId: "1:451597152411:web:680788880c2a8c4c52163e",
  measurementId: "G-GRM5GCFGLV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'the-vault-93440';

// --- Web Audio API Synthesizer for SFX ---
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'tick') {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'lock') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'gong') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    }
  } catch (e) {
    // Audio context not allowed before user interaction
  }
};

// --- Render SVG Shapes ---
const ShapeIcon = ({ shape, color, className = "" }) => {
  const colorMap = {
    'Red': '#ef4444',
    'Blue': '#3b82f6',
    'Yellow': '#eab308',
    'Green': '#22c55e',
    'Purple': '#a855f7'
  };
  const hexColor = colorMap[color] || '#ffffff';

  switch (shape) {
    case 'Circle':
      return <svg viewBox="0 0 24 24" fill={hexColor} className={className}><circle cx="12" cy="12" r="9" /></svg>;
    case 'Square':
      return <svg viewBox="0 0 24 24" fill={hexColor} className={className}><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
    case 'Triangle':
      return <svg viewBox="0 0 24 24" fill={hexColor} className={className}><polygon points="12,3 22,20 2,20" strokeLinejoin="round" /></svg>;
    case 'Star':
      return <svg viewBox="0 0 24 24" fill={hexColor} className={className}><polygon points="12,2 15,8 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,8" strokeLinejoin="round" /></svg>;
    case 'Diamond':
      return <svg viewBox="0 0 24 24" fill={hexColor} className={className}><polygon points="12,2 22,12 12,22 2,12" strokeLinejoin="round" /></svg>;
    default:
      return null;
  }
};

const SYMBOLS = ['⚡', '✦', '♠', '☯', '💎'];
const SHAPES = ['Circle', 'Square', 'Triangle', 'Star', 'Diamond'];
const COLORS = ['Red', 'Blue', 'Yellow', 'Green', 'Purple'];

// --- Board Generator ---
const generateBoard = (packageType = 'PKG_A') => {
  const isSuddenRecall = packageType === 'SUDDEN_RECALL';
  const size = isSuddenRecall ? 16 : 25;
  const gridDim = isSuddenRecall ? 4 : 5;

  let pieces = [];
  let idCounter = 0;

  if (!isSuddenRecall) {
    // 5x5: 25 unique combinations of 5 shapes & 5 colors
    for (let s of SHAPES) {
      for (let c of COLORS) {
        pieces.push({
          id: `p_${idCounter++}`,
          shape: s,
          color: c,
          number: (idCounter % 9) + 1,
          symbol: SYMBOLS[idCounter % SYMBOLS.length]
        });
      }
    }
  } else {
    // 4x4 Sudden Recall: 16 unique combinations
    for (let i = 0; i < 16; i++) {
      pieces.push({
        id: `sr_${i}`,
        shape: SHAPES[i % 5],
        color: COLORS[(i * 2) % 5],
        number: (i % 9) + 1,
        symbol: SYMBOLS[i % SYMBOLS.length]
      });
    }
  }

  // Shuffle pieces deterministically or randomly
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
};

// --- Question Generator for Memory Trap ---
const generateQuestions = (board, packageType = 'PKG_A') => {
  const gridDim = packageType === 'SUDDEN_RECALL' ? 4 : 5;
  const getCell = (r, c) => board[r * gridDim + c];

  let questions = [];

  // Q1: Center/Key Position Recall
  const centerR = Math.floor(gridDim / 2);
  const centerC = Math.floor(gridDim / 2);
  const centerPiece = getCell(centerR, centerC);
  questions.push({
    id: 'q1',
    type: 'Position Recall',
    question: `What was the SHAPE located at Row ${centerR + 1}, Column ${centerC + 1}?`,
    options: SHAPES.filter(s => s !== centerPiece.shape).slice(0, 3).concat(centerPiece.shape).sort(() => Math.random() - 0.5),
    answer: centerPiece.shape
  });

  // Q2: Object Count
  const targetColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const colorCount = board.filter(p => p.color === targetColor).length;
  const countOpts = Array.from(new Set([colorCount, colorCount + 1, Math.max(1, colorCount - 1), colorCount + 2])).sort((a, b) => a - b).map(String);
  questions.push({
    id: 'q2',
    type: 'Object Count',
    question: `How many ${targetColor.toUpperCase()} objects were present on the observation board?`,
    options: countOpts,
    answer: String(colorCount)
  });

  // Q3: Sequence & Number Recall
  const randPiece = board[Math.floor(Math.random() * board.length)];
  questions.push({
    id: 'q3',
    type: 'Sequence Recall',
    question: `What was the NUMBER inside the ${randPiece.color.toUpperCase()} ${randPiece.shape.toUpperCase()}?`,
    options: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => n !== randPiece.number).sort(() => Math.random() - 0.5).slice(0, 3).concat(randPiece.number).map(String).sort(),
    answer: String(randPiece.number)
  });

  // Q4: Color Combination
  const cornerPiece = getCell(0, gridDim - 1); // Top Right
  questions.push({
    id: 'q4',
    type: 'Color Combination',
    question: `What was the COLOR of the item in the TOP-RIGHT corner?`,
    options: COLORS.filter(c => c !== cornerPiece.color).slice(0, 3).concat(cornerPiece.color).sort(() => Math.random() - 0.5),
    answer: cornerPiece.color
  });

  // Q5: Spatial Relationship
  const targetIdx = gridDim + 1; // Row 2, Col 2
  const subject = board[targetIdx];
  const neighborAbove = board[targetIdx - gridDim];
  questions.push({
    id: 'q5',
    type: 'Spatial Relationship',
    question: `Which SHAPE was positioned directly ABOVE the ${subject.color.toUpperCase()} ${subject.shape.toUpperCase()}?`,
    options: SHAPES.filter(s => s !== neighborAbove.shape).slice(0, 3).concat(neighborAbove.shape).sort(() => Math.random() - 0.5),
    answer: neighborAbove.shape
  });

  return questions;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'PRACTICE', 'HOST', 'pA', 'pB'
  const [room, setRoom] = useState(null);
  const [selectedPkg, setSelectedPkg] = useState('PKG_A');

  // Local State for Player / Practice Mode
  const [localGrid, setLocalGrid] = useState([]);
  const [localInventory, setLocalInventory] = useState([]);
  const [selectedInvIdx, setSelectedInvIdx] = useState(null);
  const [trapIndex, setTrapIndex] = useState(0);
  const [trapAnswers, setTrapAnswers] = useState({});
  const [practicePhase, setPracticePhase] = useState('LOBBY'); // For PRACTICE mode
  const [practiceTimer, setPracticeTimer] = useState(60);

  // Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // Attempt anonymous sign in safely
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.warn("Firebase Auth bypassed or Anonymous auth not enabled in Firebase Console. Local single player mode remains fully functional.", err);
        // Fallback local mock user so single player mode works flawlessly
        setUser({ uid: 'local_demo_user' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Sync Room State from Firestore for Multi-Device
  useEffect(() => {
    if (!user || role === 'PRACTICE') return;

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'roomState', 'main');
      const unsubscribe = onSnapshot(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setRoom(data);
          
          // Initialize local reconstruction grid when entering RECONSTRUCTION
          if (data.phase === 'RECONSTRUCTION' && localInventory.length === 0 && data.masterBoard) {
            const boardSize = data.masterBoard.length;
            setLocalGrid(Array(boardSize).fill(null));
            setLocalInventory([...data.masterBoard].sort(() => Math.random() - 0.5));
            setSelectedInvIdx(null);
          }
        } else if (role === 'HOST') {
          resetFirestoreRoom('PKG_A');
        }
      }, (err) => console.error("Firestore sync error:", err));

      return () => unsubscribe();
    } catch (e) {
      console.warn("Firestore error:", e);
    }
  }, [user, role, localInventory.length]);

  // Practice Timer Countdown
  useEffect(() => {
    if (role !== 'PRACTICE') return;
    let timerId;
    if (practicePhase === 'GLIMPSE' && practiceTimer > 0) {
      timerId = setInterval(() => {
        setPracticeTimer(t => {
          if (t <= 1) {
            playSound('gong');
            setPracticePhase('VANISHING');
            setTimeout(() => {
              setPracticePhase('RECONSTRUCTION');
              setPracticeTimer(180);
            }, 3000);
            return 0;
          }
          if (t <= 5) playSound('tick');
          return t - 1;
        });
      }, 1000);
    } else if (practicePhase === 'RECONSTRUCTION' && practiceTimer > 0) {
      timerId = setInterval(() => {
        setPracticeTimer(t => {
          if (t <= 1) {
            playSound('gong');
            lockLocalReconstruction();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerId);
  }, [role, practicePhase, practiceTimer]);

  // Firestore Reset & Control Actions for HOST
  const resetFirestoreRoom = async (pkg = 'PKG_A') => {
    if (!user) return;
    const board = generateBoard(pkg);
    const questions = generateQuestions(board, pkg);
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'roomState', 'main');

    await setDoc(roomRef, {
      phase: 'LOBBY',
      packageType: pkg,
      masterBoard: board,
      trapQuestions: questions,
      pA: { reconGrid: Array(board.length).fill(null), reconScore: 0, trapAnswers: {}, trapScore: 0, reconLocked: false, trapLocked: false, total: 0 },
      pB: { reconGrid: Array(board.length).fill(null), reconScore: 0, trapAnswers: {}, trapScore: 0, reconLocked: false, trapLocked: false, total: 0 }
    });
  };

  const setFirestorePhase = async (newPhase) => {
    if (!user || !room) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'roomState', 'main');
    playSound('gong');
    await updateDoc(roomRef, { phase: newPhase });
  };

  // --- PRACTICE MODE ACTIONS ---
  const startPracticeGame = (pkg = 'PKG_A') => {
    setSelectedPkg(pkg);
    const board = generateBoard(pkg);
    const questions = generateQuestions(board, pkg);
    const size = board.length;

    setRoom({
      phase: 'GLIMPSE',
      packageType: pkg,
      masterBoard: board,
      trapQuestions: questions,
      pA: { reconGrid: Array(size).fill(null), reconScore: 0, trapAnswers: {}, trapScore: 0, reconLocked: false, trapLocked: false, total: 0 }
    });

    setLocalGrid(Array(size).fill(null));
    setLocalInventory([...board].sort(() => Math.random() - 0.5));
    setPracticeTimer(pkg === 'SUDDEN_RECALL' ? 15 : 60);
    setPracticePhase('GLIMPSE');
    setTrapIndex(0);
    setTrapAnswers({});
  };

  // Reconstruction Mechanics (Tap-to-Select & Place)
  const handleInventoryClick = (idx) => {
    if (localInventory[idx]) {
      setSelectedInvIdx(selectedInvIdx === idx ? null : idx);
      playSound('tick');
    }
  };

  const handleGridClick = (gridIdx) => {
    let newGrid = [...localGrid];
    let newInv = [...localInventory];

    if (newGrid[gridIdx]) {
      // Return piece to inventory
      const emptyIdx = newInv.findIndex(p => p === null);
      if (emptyIdx !== -1) {
        newInv[emptyIdx] = newGrid[gridIdx];
      } else {
        newInv.push(newGrid[gridIdx]);
      }
      newGrid[gridIdx] = null;
      playSound('tick');
    } else if (selectedInvIdx !== null && newInv[selectedInvIdx]) {
      // Place piece onto grid
      newGrid[gridIdx] = newInv[selectedInvIdx];
      newInv[selectedInvIdx] = null;
      setSelectedInvIdx(null);
      playSound('tick');
    }

    setLocalGrid(newGrid);
    setLocalInventory(newInv);
  };

  const lockLocalReconstruction = async () => {
    playSound('lock');
    const board = room.masterBoard;
    let score = 0;
    board.forEach((target, i) => {
      if (localGrid[i] && localGrid[i].id === target.id) {
        score += 3;
      }
    });

    if (role === 'PRACTICE') {
      setRoom(prev => ({
        ...prev,
        pA: { ...prev.pA, reconGrid: localGrid, reconScore: score, reconLocked: true }
      }));
      setPracticePhase('TRAP');
    } else if (role === 'pA' || role === 'pB') {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'roomState', 'main');
      await updateDoc(roomRef, {
        [`${role}.reconGrid`]: localGrid,
        [`${role}.reconScore`]: score,
        [`${role}.reconLocked`]: true
      });
    }
  };

  const submitTrapAnswer = async (answer) => {
    playSound('tick');
    const newAnswers = { ...trapAnswers, [trapIndex]: answer };
    setTrapAnswers(newAnswers);

    if (trapIndex < 4) {
      setTrapIndex(prev => prev + 1);
    } else {
      // Calculate Trap Score
      let trapScore = 0;
      room.trapQuestions.forEach((q, i) => {
        if (newAnswers[i] === q.answer) trapScore += 5;
      });

      playSound('lock');

      if (role === 'PRACTICE') {
        setRoom(prev => ({
          ...prev,
          phase: 'RESULTS',
          pA: { ...prev.pA, trapAnswers: newAnswers, trapScore: trapScore, total: prev.pA.reconScore + trapScore, trapLocked: true }
        }));
        setPracticePhase('RESULTS');
      } else if (role === 'pA' || role === 'pB') {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'roomState', 'main');
        await updateDoc(roomRef, {
          [`${role}.trapAnswers`]: newAnswers,
          [`${role}.trapScore`]: trapScore,
          [`${role}.total`]: room[role].reconScore + trapScore,
          [`${role}.trapLocked`]: true
        });
      }
    }
  };

  // UI Piece Component
  const Piece = ({ piece, onClick, isSelected, inGrid }) => {
    if (!piece) return <div onClick={onClick} className={`w-full h-full rounded-lg border-2 border-dashed border-slate-700 bg-slate-900/60 transition-colors ${inGrid ? 'hover:border-blue-500/50 cursor-pointer' : ''}`} />;
    return (
      <div onClick={onClick} className={`relative w-full h-full flex flex-col items-center justify-center cursor-pointer transition-all duration-150 rounded-lg shadow-md border ${isSelected ? 'ring-4 ring-yellow-400 scale-105 bg-slate-800 border-yellow-400 z-10' : 'bg-slate-800/90 border-slate-700 hover:scale-102 hover:border-slate-500'}`}>
        <ShapeIcon shape={piece.shape} color={piece.color} className="w-8 h-8 md:w-12 md:h-12 drop-shadow-md" />
        <div className="flex items-center space-x-1 mt-1">
          <span className="text-white font-black text-sm md:text-base drop-shadow">{piece.number}</span>
          <span className="text-xs opacity-75">{piece.symbol}</span>
        </div>
      </div>
    );
  };

  // Active Phase Determination
  const activePhase = role === 'PRACTICE' ? practicePhase : (room?.phase || 'LOBBY');
  const isSudden = room?.packageType === 'SUDDEN_RECALL';
  const gridColsClass = isSudden ? 'grid-cols-4' : 'grid-cols-5';

  if (!user) {
    return <div className="min-h-screen bg-slate-950 text-blue-400 font-mono flex items-center justify-center">INITIALIZING VAULT CONNECTION...</div>;
  }

  // --- ROLE SELECTOR ---
  if (!role) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans selection:bg-blue-500">
        <div className="max-w-xl w-full text-center space-y-8 p-8 border border-blue-900/40 bg-slate-900/90 rounded-3xl shadow-[0_0_60px_-15px_rgba(59,130,246,0.3)]">
          <div className="space-y-2">
            <h3 className="text-blue-400 tracking-[0.4em] uppercase text-xs font-bold">Grand Final TOC 2026</h3>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-yellow-400 drop-shadow">
              THE MEMORY VAULT
            </h1>
            <p className="text-sm text-slate-400 italic">SEE EVERYTHING. REMEMBER EVERYTHING.</p>
          </div>

          <div className="space-y-3 pt-4">
            <button onClick={() => setRole('PRACTICE')} className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2">
              <span>🎮</span> Single Player Practice
            </button>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-600 text-xs uppercase font-mono">Real-Time Multi-Device</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setRole('HOST')} className="py-3 bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold rounded-xl border border-yellow-500/30 text-xs tracking-wider uppercase">
                Host / Operator
              </button>
              <button onClick={() => setRole('pA')} className="py-3 bg-blue-950 hover:bg-blue-900 text-blue-300 font-bold rounded-xl border border-blue-500/40 text-xs tracking-wider uppercase">
                Player A
              </button>
              <button onClick={() => setRole('pB')} className="py-3 bg-purple-950 hover:bg-purple-900 text-purple-300 font-bold rounded-xl border border-purple-500/40 text-xs tracking-wider uppercase">
                Player B
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- HOST / OPERATOR VIEW ---
  if (role === 'HOST') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-6 font-sans">
        <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-black tracking-widest text-yellow-400">OPERATOR CONTROL DASHBOARD</h1>
            <p className="text-xs text-slate-500 font-mono">TOC 2026 GRAND FINAL — REAL-TIME CONTROLLER</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="px-4 py-1.5 bg-slate-900 border border-slate-700 rounded-full font-mono text-xs text-blue-400">
              CURRENT PHASE: <strong className="text-white">{room?.phase || 'LOBBY'}</strong>
            </span>
            <button onClick={() => setRole(null)} className="text-xs text-slate-400 hover:text-white underline">Switch Terminal</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phase Control Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase mb-4">1. Select Game Package</h2>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {['PKG_A', 'PKG_B', 'SUDDEN_RECALL'].map(pkg => (
                <button key={pkg} onClick={() => resetFirestoreRoom(pkg)} className={`py-2 text-xs font-bold rounded-lg border transition-all ${room?.packageType === pkg ? 'bg-yellow-500 text-slate-950 border-yellow-400' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                  {pkg === 'SUDDEN_RECALL' ? 'Sudden Recall (4x4)' : pkg.replace('_', ' ')}
                </button>
              ))}
            </div>

            <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase mb-2">2. Advance Game Phase</h2>
            <button onClick={() => setFirestorePhase('GLIMPSE')} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm tracking-widest uppercase shadow">Phase 1: Start Glimpse (Observation)</button>
            <button onClick={() => setFirestorePhase('VANISHING')} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm tracking-widest uppercase border border-slate-700">Phase 2: The Vanishing</button>
            <button onClick={() => setFirestorePhase('RECONSTRUCTION')} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm tracking-widest uppercase shadow">Phase 3: Reconstruction</button>
            <button onClick={() => setFirestorePhase('TRAP')} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm tracking-widest uppercase shadow">Phase 4: Memory Trap</button>
            <button onClick={() => setFirestorePhase('RESULTS')} className="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 font-black rounded-xl text-sm tracking-widest uppercase shadow-lg">Phase 5: Reveal Final Score</button>
          </div>

          {/* Live Player Monitors */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {['pA', 'pB'].map((p) => {
              const pData = room?.[p] || {};
              const pName = p === 'pA' ? 'PLAYER A' : 'PLAYER B';
              const pColor = p === 'pA' ? 'blue' : 'purple';
              return (
                <div key={p} className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between border-t-4 border-t-${pColor}-500 shadow-xl`}>
                  <div>
                    <h3 className={`text-xl font-black text-${pColor}-400 mb-4 tracking-widest`}>{pName}</h3>
                    <div className="space-y-3 font-mono text-sm">
                      <div className="flex justify-between items-center p-2 bg-slate-950/60 rounded">
                        <span className="text-slate-400">Reconstruction Status:</span>
                        <span className={pData.reconLocked ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold animate-pulse'}>
                          {pData.reconLocked ? '✓ LOCKED' : 'IN PROGRESS'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-slate-950/60 rounded">
                        <span className="text-slate-400">Memory Trap Status:</span>
                        <span className={pData.trapLocked ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold animate-pulse'}>
                          {pData.trapLocked ? '✓ LOCKED' : 'WAITING'}
                        </span>
                      </div>
                      <hr className="border-slate-800 my-2" />
                      <div className="flex justify-between text-slate-400"><span>Recon Score:</span><span className="text-white font-bold">{pData.reconScore || 0} / 75</span></div>
                      <div className="flex justify-between text-slate-400"><span>Trap Score:</span><span className="text-white font-bold">{pData.trapScore || 0} / 25</span></div>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-xs font-mono text-slate-500">TOTAL ACCUMULATED SCORE</span>
                    <span className="text-3xl font-black text-yellow-400">{pData.total || 0} <span className="text-xs text-slate-500">/100</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- PLAYER & PRACTICE GAMEPLAY VIEW ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping"></div>
          <span className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">THE MEMORY VAULT</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase border ${role === 'pA' ? 'bg-blue-950 text-blue-400 border-blue-500/40' : role === 'pB' ? 'bg-purple-950 text-purple-400 border-purple-500/40' : 'bg-emerald-950 text-emerald-400 border-emerald-500/40'}`}>
            {role === 'PRACTICE' ? 'PRACTICE MODE' : role === 'pA' ? 'PLAYER A' : 'PLAYER B'}
          </span>
          <button onClick={() => setRole(null)} className="text-xs text-slate-500 hover:text-slate-300">Exit</button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 md:p-8">
        
        {/* LOBBY / SETUP (PRACTICE) */}
        {activePhase === 'LOBBY' && role === 'PRACTICE' && (
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-white tracking-wider">Practice Setup</h2>
            <p className="text-slate-400 text-sm">Select a game package to test observation, reconstruction, and memory trap questions.</p>
            <div className="space-y-3">
              <button onClick={() => startPracticeGame('PKG_A')} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm tracking-wider uppercase transition">Package A (Extreme 5x5)</button>
              <button onClick={() => startPracticeGame('PKG_B')} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm tracking-wider uppercase transition">Package B (Extreme 5x5)</button>
              <button onClick={() => startPracticeGame('SUDDEN_RECALL')} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black rounded-xl text-sm tracking-wider uppercase transition">Package C (Sudden Recall 4x4)</button>
            </div>
          </div>
        )}

        {/* LOBBY (MULTI-DEVICE WAITING) */}
        {activePhase === 'LOBBY' && role !== 'PRACTICE' && (
          <div className="text-center space-y-4 animate-pulse">
            <div className="text-5xl">⏳</div>
            <h2 className="text-2xl md:text-3xl font-light text-slate-400 tracking-widest uppercase">Waiting for Operator to Start Glimpse...</h2>
            <p className="text-slate-600 text-sm">Keep your eyes on the main screen.</p>
          </div>
        )}

        {/* PHASE 1: THE GLIMPSE */}
        {activePhase === 'GLIMPSE' && room?.masterBoard && (
          <div className="w-full max-w-2xl flex flex-col items-center space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center w-full px-2">
              <h2 className="text-xl md:text-2xl font-black text-blue-400 tracking-widest uppercase">Phase 1: The Glimpse</h2>
              {role === 'PRACTICE' && (
                <div className="text-2xl font-mono font-bold text-yellow-400 bg-slate-900 px-4 py-1 rounded-xl border border-yellow-500/30">
                  ⏱️ {practiceTimer}s
                </div>
              )}
            </div>

            <div className={`grid ${gridColsClass} gap-2 sm:gap-3 w-full aspect-square p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-[0_0_50px_-10px_rgba(59,130,246,0.25)]`}>
              {room.masterBoard.map((piece, i) => (
                <div key={i} className="relative w-full h-full flex flex-col items-center justify-center bg-slate-800 rounded-xl border border-slate-700/60 shadow-inner">
                  <ShapeIcon shape={piece.shape} color={piece.color} className="w-10 h-10 md:w-14 md:h-14 drop-shadow-md" />
                  <div className="flex items-center space-x-1 mt-1">
                    <span className="text-white font-black text-sm md:text-lg drop-shadow">{piece.number}</span>
                    <span className="text-xs opacity-75">{piece.symbol}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PHASE 2: THE VANISHING */}
        {activePhase === 'VANISHING' && (
          <div className="text-center space-y-4 animate-fadeIn">
            <div className="w-24 h-24 mx-auto border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
            <h2 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-600 tracking-widest uppercase">
              THE VANISHING
            </h2>
            <p className="text-slate-500 text-sm tracking-wider">Information wiped from screen. Prepare for Reconstruction.</p>
          </div>
        )}

        {/* PHASE 3: THE RECONSTRUCTION */}
        {activePhase === 'RECONSTRUCTION' && (
          <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 items-start justify-center animate-fadeIn">
            {/* Board Grid */}
            <div className="w-full lg:w-1/2 flex flex-col items-center space-y-4">
              <div className="flex justify-between items-center w-full">
                <h2 className="text-lg md:text-xl font-bold text-emerald-400 tracking-widest uppercase">Phase 3: Reconstruction</h2>
                {role === 'PRACTICE' && (
                  <span className="text-sm font-mono text-yellow-400">⏱️ {Math.floor(practiceTimer / 60)}:{(practiceTimer % 60).toString().padStart(2, '0')}</span>
                )}
              </div>

              <div className={`grid ${gridColsClass} gap-2 w-full aspect-square p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl`}>
                {localGrid.map((piece, i) => (
                  <div key={`grid-${i}`} className="w-full h-full">
                    <Piece piece={piece} onClick={() => handleGridClick(i)} inGrid={true} />
                  </div>
                ))}
              </div>

              <button onClick={lockLocalReconstruction} className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black rounded-xl tracking-widest uppercase shadow-lg text-sm">
                🔒 LOCK RECONSTRUCTION ANSWER
              </button>
            </div>

            {/* Tile Inventory */}
            <div className="w-full lg:w-1/2 flex flex-col items-center space-y-4">
              <h3 className="text-xs font-mono text-slate-400 tracking-widest uppercase">Tile Inventory (Tap to Select)</h3>
              <div className={`grid ${gridColsClass} gap-2 w-full p-3 bg-slate-950 border border-slate-800 rounded-2xl max-h-[450px] overflow-y-auto`}>
                {localInventory.map((piece, i) => (
                  <div key={`inv-${i}`} className="w-full aspect-square">
                    <Piece piece={piece} onClick={() => handleInventoryClick(i)} isSelected={selectedInvIdx === i} inGrid={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: THE MEMORY TRAP */}
        {activePhase === 'TRAP' && room?.trapQuestions && (
          <div className="w-full max-w-2xl flex flex-col items-center space-y-6 animate-fadeIn">
            <div className="text-center space-y-2">
              <span className="px-3 py-1 bg-red-950 text-red-400 border border-red-800 rounded-full text-xs font-mono tracking-widest uppercase">
                MEMORY TRAP QUESTION {trapIndex + 1} OF 5
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-white">{room.trapQuestions[trapIndex].type}</h2>
            </div>

            <div className="w-full bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl shadow-2xl space-y-6 text-center">
              <p className="text-lg md:text-xl text-slate-200 font-medium leading-relaxed">
                {room.trapQuestions[trapIndex].question}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                {room.trapQuestions[trapIndex].options.map((opt, i) => (
                  <button key={i} onClick={() => submitTrapAnswer(opt)} className="py-4 px-6 bg-slate-800 hover:bg-blue-900/40 border border-slate-700 hover:border-blue-400 rounded-xl text-base font-bold text-slate-200 transition-all shadow">
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PHASE 5: FINAL RESULTS */}
        {activePhase === 'RESULTS' && (
          <div className="w-full max-w-4xl flex flex-col items-center space-y-8 animate-fadeIn py-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 tracking-tight">
                FINAL SCORE DISPLAY
              </h1>
              <p className="text-xs font-mono text-slate-400 tracking-widest uppercase">TOC 2026 GRAND FINAL RESULT</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {['pA', ...(role !== 'PRACTICE' ? ['pB'] : [])].map(p => {
                const pData = room?.[p] || {};
                const pName = role === 'PRACTICE' ? 'SINGLE PLAYER' : p === 'pA' ? 'PLAYER A' : 'PLAYER B';
                const pColor = p === 'pA' ? 'blue' : 'purple';
                const total = pData.total || 0;

                return (
                  <div key={p} className={`bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col items-center space-y-6 shadow-2xl relative overflow-hidden border-t-4 border-t-${pColor}-500`}>
                    <h3 className={`text-xl font-black text-${pColor}-400 tracking-widest`}>{pName}</h3>
                    
                    <div className="relative w-36 h-36 flex items-center justify-center bg-slate-950 rounded-full border-4 border-slate-800 shadow-inner">
                      <div className="text-center">
                        <span className="text-4xl font-black text-white">{total}</span>
                        <span className="block text-xs text-slate-500 font-mono">/ 100 PTS</span>
                      </div>
                    </div>

                    <div className="w-full space-y-3 font-mono text-sm">
                      <div className="flex justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-slate-400">Reconstruction (75 max)</span>
                        <span className="text-emerald-400 font-bold">{pData.reconScore || 0} pts</span>
                      </div>
                      <div className="flex justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-slate-400">Memory Trap (25 max)</span>
                        <span className="text-yellow-400 font-bold">{pData.trapScore || 0} pts</span>
                      </div>
                      <div className="flex justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <span className="text-slate-400">Accuracy</span>
                        <span className="text-blue-400 font-bold">{Math.round((total / 100) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => { setRole(null); setPracticePhase('LOBBY'); }} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs tracking-widest uppercase border border-slate-700">
              PLAY AGAIN / RESET TERMINAL
            </button>
          </div>
        )}

      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
      `}} />
    </div>
  );
}