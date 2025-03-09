import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "You're back online!",
        description: "Syncing pending doses...",
        duration: 3000,
      });
      setIsSyncing(true);
      // Trigger sync after coming online
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          if ('sync' in registration) {
            registration.sync.register('sync-doses')
              .finally(() => setIsSyncing(false));
          }
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: "You're offline",
        description: "Doses will be saved locally and synced when you're back online",
        duration: 3000,
        variant: "destructive",
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {isOnline ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : (
          <WifiOff className="w-4 h-4 text-destructive" />
        )}
        <span className={cn(
          "text-sm",
          isOnline ? "text-green-500" : "text-destructive"
        )}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      {isSyncing && (
        <span className="text-sm text-muted-foreground animate-pulse">
          Syncing...
        </span>
      )}
    </div>
  );
}
