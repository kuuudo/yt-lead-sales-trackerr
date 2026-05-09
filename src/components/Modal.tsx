import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X, CheckCircle2, Info } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  variant?: 'danger' | 'info' | 'success';
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  confirmLabel = 'Confirm', 
  cancelLabel = 'Cancel', 
  onConfirm, 
  variant = 'info' 
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          
          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            {/* Background Glow */}
            <div className={`absolute -top-24 -right-24 w-48 h-48 blur-[100px] rounded-full opacity-20 pointer-events-none ${
              variant === 'danger' ? 'bg-red-600' : variant === 'success' ? 'bg-green-600' : 'bg-blue-600'
            }`} />

            <div className="flex items-start gap-5 mb-8 relative">
              <div className={`p-4 rounded-2xl shrink-0 ${
                variant === 'danger' ? 'bg-red-500/10 text-red-500' : 
                variant === 'success' ? 'bg-green-500/10 text-green-500' : 
                'bg-blue-500/10 text-blue-500'
              }`}>
                {variant === 'danger' && <AlertCircle size={28} />}
                {variant === 'success' && <CheckCircle2 size={28} />}
                {variant === 'info' && <Info size={28} />}
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2 leading-tight">{title}</h3>
                <p className="text-zinc-400 text-sm font-medium leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
            
            <div className={`flex gap-3 ${!onConfirm ? 'justify-end' : ''}`}>
              {onConfirm && (
                <button 
                  onClick={onClose}
                  className="flex-1 px-6 py-4 rounded-2xl border border-zinc-800 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
                >
                  {cancelLabel}
                </button>
              )}
              <button 
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
                className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex-1 min-w-[120px] ${
                  variant === 'danger' 
                    ? 'bg-red-600 text-white hover:bg-red-500 shadow-[0_10px_30px_rgba(220,38,38,0.3)]' 
                    : variant === 'success'
                    ? 'bg-green-600 text-white hover:bg-green-500 shadow-[0_10px_30px_rgba(22,163,74,0.3)]'
                    : 'bg-white text-zinc-950 hover:bg-zinc-200'
                }`}
              >
                {onConfirm ? confirmLabel : 'Dismiss'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
