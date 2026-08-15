import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

export function useEscalationBadge(userId: string | undefined, hasRole: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId || !hasRole) return;
    
    // Initial fetch
    fetch("/api/ai-ceo/escalations/count")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCount(data.count);
      })
      .catch((err) => console.error("[useEscalationBadge] err", err));

    // Supabase realtime for insert/update on ai_ceo_suggestions
    const channelId = `ai_ceo_suggestions_admin_${Math.random().toString(36).substring(2, 9)}`;
    const chan = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_ceo_suggestions",
          filter: "category=eq.balasan_member",
        },
        () => {
          // fetch again
          fetch("/api/ai-ceo/escalations/count")
            .then((r) => r.json())
            .then((data) => {
              if (data.success) setCount(data.count);
            })
            .catch((e) => console.error(e));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
  }, [userId, hasRole]);

  return count;
}
