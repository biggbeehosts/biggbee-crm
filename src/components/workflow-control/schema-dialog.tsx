"use client";

import * as React from "react";
import { FileJson } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SchemaDialog({ inputSchema, outputSchema }: { inputSchema: string[]; outputSchema: string[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FileJson className="h-3.5 w-3.5" /> Schema
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Input / Output schema</DialogTitle>
          <DialogDescription>The fields this integration guarantees to send and expects back -- enforced in code, shown here read-only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Expected input</p>
            {inputSchema.length === 0 ? (
              <p className="text-xs text-text-tertiary">No input fields (this integration takes no payload).</p>
            ) : (
              <ul className="space-y-1">
                {inputSchema.map((field) => (
                  <li key={field} className="rounded-md bg-panel px-2.5 py-1 font-mono text-xs text-text-secondary">
                    {field}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Expected output</p>
            {outputSchema.length === 0 ? (
              <p className="text-xs text-text-tertiary">No structured output tracked for this integration.</p>
            ) : (
              <ul className="space-y-1">
                {outputSchema.map((field) => (
                  <li key={field} className="rounded-md bg-panel px-2.5 py-1 font-mono text-xs text-text-secondary">
                    {field}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
