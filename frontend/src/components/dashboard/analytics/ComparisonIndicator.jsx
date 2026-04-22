import React from 'react';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

const ComparisonIndicator = ({ value, label = 'vs last period', reverse = false }) => {
  const isPositive = value >= 0;
  const isGood = reverse ? !isPositive : isPositive;
  
  if (value === 0 || value === undefined) return null;

  return (
    <div className={`flex items-center gap-1 text-xs font-bold ${isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
      {isPositive ? <FiTrendingUp size={12} /> : <FiTrendingDown size={12} />}
      <span>{Math.abs(value)}%</span>
      <span className="text-[10px] text-gray-400 font-medium ml-0.5">{label}</span>
    </div>
  );
};

export default ComparisonIndicator;
