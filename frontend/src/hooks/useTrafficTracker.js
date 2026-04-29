import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
const generateSessionId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const useTrafficTracker = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Get or create session ID
    let sessionId = sessionStorage.getItem('site_session_id');
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem('site_session_id', sessionId);
    }

    const logVisit = async () => {
      try {
        const deviceType = /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
        
        // Basic browser detection
        const ua = navigator.userAgent;
        let browser = "Other";
        if (ua.indexOf("Chrome") > -1) browser = "Chrome";
        else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
        else if (ua.indexOf("Safari") > -1) browser = "Safari";
        
        let os = "Other";
        if (ua.indexOf("Windows") > -1) os = "Windows";
        else if (ua.indexOf("Mac") > -1) os = "MacOS";
        else if (ua.indexOf("Android") > -1) os = "Android";
        else if (ua.indexOf("iPhone") > -1) os = "iOS";

        await api.post('/analytics/log-visit', {
          path: location.pathname,
          sessionId,
          userId: user?.id,
          deviceType,
          browser,
          os,
          referrer: document.referrer
        });
      } catch (err) {
        // Silent fail for analytics
        console.warn('Traffic tracking failed:', err.message);
      }
    };

    logVisit();
  }, [location.pathname, user?.id]);
};

export default useTrafficTracker;
