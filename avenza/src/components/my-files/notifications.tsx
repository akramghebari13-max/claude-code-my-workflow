import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/app";
import type { PersonalNotification } from "@/lib/myfiles-queries";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NotificationsBell({ notifications }: { notifications: PersonalNotification[] }) {
  const qc = useQueryClient();
  const unread = notifications.filter((n) => !n.read_at);
  const mark = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("pf_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-files"] }),
    onError: (error) => toast.error(friendlyError(error)),
  });
  const label = unread.length
    ? `Notifications, ${unread.length} unread`
    : "Notifications, none unread";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={label} title={label}>
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-primary-foreground"
            >
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">Notifications</h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={!unread.length || mark.isPending}
            onClick={() => mark.mutate(unread.map((n) => n.id))}
          >
            Mark all as read
          </Button>
        </div>
        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications yet. Bill reminders, budget alerts and goal updates will appear here.
          </p>
        ) : (
          <ul className="max-h-[60dvh] divide-y overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id} className={`px-4 py-3 ${n.read_at ? "" : "bg-muted/60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {!n.read_at && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </p>
                  {!n.read_at && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto shrink-0 p-0 text-xs"
                      disabled={mark.isPending}
                      onClick={() => mark.mutate([n.id])}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {n.read_at ? " · Read" : " · New"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
