import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { Note } from "../lib/constants";
import { Pencil, Trash, Clock, Plus, Save, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

interface NotesSectionProps {
  doseId: number;
  notes: Note[];
  onAddNote: (doseId: number, text: string) => Promise<void>;
  onUpdateNote: (doseId: number, noteId: string, text: string) => Promise<void>;
  onDeleteNote: (doseId: number, noteId: string) => Promise<void>;
}

export function NotesSection({
  doseId,
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: NotesSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Sort notes by timestamp, newest first
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    setIsLoading(true);
    try {
      await onAddNote(doseId, newNoteText);
      setNewNoteText("");
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to add note:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!editingNoteText.trim()) return;

    setIsLoading(true);
    try {
      await onUpdateNote(doseId, noteId, editingNoteText);
      setEditingNoteId(null);
    } catch (error) {
      console.error("Failed to update note:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (confirm("Are you sure you want to delete this note?")) {
      setIsLoading(true);
      try {
        await onDeleteNote(doseId, noteId);
      } catch (error) {
        console.error("Failed to delete note:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingNoteText("");
  };

  return (
    <div className="mt-1 space-y-1">
      {/* Add Note Button or Form */}
      {!isAdding ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-10 text-[9px] w-full justify-start pl-0 -ml-1"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-2.5 w-2.5 mr-1" />
          Add note
        </Button>
      ) : (
        <div className="p-1 bg-muted/20 rounded-md">
          <Textarea
            placeholder="Add note..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            className="text-[9px] min-h-[120px] resize-none p-1"
          />
          <div className="flex justify-end gap-1 mt-1">
            <Button
              variant="ghost"
              size="lg"
              className="h-5 text-[10px] px-1 my-2"
              onClick={() => {
                setIsAdding(false);
                setNewNoteText("");
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="lg"
              className="h-5 text-[10px] px-2 my-2"
              onClick={handleAddNote}
              disabled={isLoading || !newNoteText.trim()}
            >
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Notes List - only show if there are notes */}
      {sortedNotes.length > 0 && (
        <div className="space-y-1">
          {sortedNotes.map((note) => (
            <div
              key={note.id}
              className="bg-muted/20 dark:bg-muted/10 rounded-md p-1 text-[10px]"
            >
              {editingNoteId === note.id ? (
                <div className="space-y-4 ">
                  <Textarea
                    value={editingNoteText}
                    onChange={(e) => setEditingNoteText(e.target.value)}
                    className="text-[9px]  min-h-[120px] resize-none p-1"
                  />
                  <div className="flex gap-4 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5  text-[12px] px-2"
                      onClick={cancelEditing}
                      disabled={isLoading}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-5 text-[12px] px-2"
                      onClick={() => handleUpdateNote(note.id!)}
                      disabled={isLoading || !editingNoteText.trim()}
                    >
                      <Save className="h-2 w-2" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex border-b pb-1 justify-between items-start">
                    <div className="flex items-center text-[8px] text-muted-foreground">
                      <Clock className="h-2 w-2 mr-0.5" />
                      {format(parseISO(note.timestamp), "MMM d, h:mm a")}
                    </div>
                    <div className="flex gap-4 mb-1 items-center ml-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => startEditing(note)}
                      >
                        <Pencil className="h-2 w-2" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 text-destructive"
                        onClick={() => handleDeleteNote(note.id!)}
                      >
                        <Trash className="h-2 w-2" />
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap break-words mt-0.5">
                    {note.text}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
