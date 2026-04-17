import React from 'react';
import { Cloud, CheckCircle, Loader2 } from 'lucide-react';

/**
 * A subtle indicator for autosave status.
 * 
 * @param {Object} props
 * @param {Date|string|number|null} props.lastSaved - The timestamp of the last successful save.
 * @param {boolean} props.isSaving - Whether a save is currently in progress.
 * @param {string} props.className - Additional CSS classes.
 */
const AutoSaveIndicator = ({ lastSaved, isSaving, className = '' }) => {
  if (!lastSaved && !isSaving) return null;

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className={`flex items-center space-x-2 text-sm transition-all duration-300 ${className}`}>
      {isSaving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span className="text-gray-500 font-medium">Saving draft...</span>
        </>
      ) : (
        <>
          <CheckCircle className="h-3 w-3 text-green-500" />
          <span className="text-gray-400">
            Draft saved at {formatTime(lastSaved)}
          </span>
        </>
      )}
    </div>
  );
};

export default AutoSaveIndicator;
