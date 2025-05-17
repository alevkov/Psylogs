import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { GeneralNote } from "../lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { AlertCircle, Clock, Pencil, Plus, Save, Trash, X } from "lucide-react";
import {
  addGeneralNote,
  updateGeneralNote,
  deleteGeneralNote,
} from "../lib/db";

interface GeneralNotesTimelineProps {
  notes: GeneralNote[];
  onNotesChange: () => void;
}

export function GeneralNotesTimeline({
  notes,
  onNotesChange,
}: GeneralNotesTimelineProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editingNoteTitle, setEditingNoteTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Sort notes by timestamp, newest first
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Group notes by date
  const groupedNotes: Record<string, GeneralNote[]> = {};
  sortedNotes.forEach((note) => {
    const date = format(parseISO(note.timestamp), "yyyy-MM-dd");
    if (!groupedNotes[date]) {
      groupedNotes[date] = [];
    }
    groupedNotes[date].push(note);
  });

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    setIsLoading(true);
    try {
      const newNote: Omit<GeneralNote, "id"> = {
        timestamp: new Date().toISOString(),
        text: newNoteText,
        title: newNoteTitle || "",
      };

      await addGeneralNote(newNote);
      setNewNoteText("");
      setNewNoteTitle("");
      setIsAdding(false);
      onNotesChange();
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
      await updateGeneralNote(noteId, {
        text: editingNoteText,
        title: editingNoteTitle,
      });
      setEditingNoteId(null);
      onNotesChange();
    } catch (error) {
      console.error("Failed to update note:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      setIsLoading(true);
      try {
        await deleteGeneralNote(noteId);
        onNotesChange();
      } catch (error) {
        console.error("Failed to delete note:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const startEditing = (note: GeneralNote) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
    setEditingNoteTitle(note.title || "");
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditingNoteText("");
    setEditingNoteTitle("");
  };

  if (notes.length === 0) {
    return (
      <div className="w-full p-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <AlertCircle className="h-16 w-16 text-muted-foreground opacity-40" />
          <h3 className="text-xl font-medium">No Notes Available</h3>
          <p className="text-muted-foreground max-w-md">
            Add your first note to start keeping track of your experiences.
          </p>
          <Button
            variant="default"
            className="mt-4"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </div>

        {/* Add Note Dialog - showing when isAdding is true even if there are no notes */}
        {isAdding && (
          <Dialog open={isAdding} onOpenChange={setIsAdding}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Note</DialogTitle>
                <DialogDescription>
                  Create a new note to record your experiences.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label htmlFor="noteTitle" className="text-sm font-medium">
                    Title (optional)
                  </label>
                  <Input
                    id="noteTitle"
                    placeholder="Note title"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="noteText" className="text-sm font-medium">
                    Note
                  </label>
                  <Textarea
                    id="noteText"
                    placeholder="Write your note here..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAdding(false);
                      setNewNoteText("");
                      setNewNoteTitle("");
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleAddNote}
                    disabled={isLoading || !newNoteText.trim()}
                  >
                    {isLoading ? "Saving..." : "Save Note"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Notes Timeline</h2>
        <Button
          variant="default"
          size="sm"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Note
        </Button>
      </div>

      {/* Add Note Dialog */}
      {isAdding && (
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Note</DialogTitle>
              <DialogDescription>
                Create a new note to record your experiences.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label htmlFor="noteTitle" className="text-sm font-medium">
                  Title (optional)
                </label>
                <Input
                  id="noteTitle"
                  placeholder="Note title"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="noteText" className="text-sm font-medium">
                  Note
                </label>
                <Textarea
                  id="noteText"
                  placeholder="Write your note here..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAdding(false);
                    setNewNoteText("");
                    setNewNoteTitle("");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleAddNote}
                  disabled={isLoading || !newNoteText.trim()}
                >
                  {isLoading ? "Saving..." : "Save Note"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Tree timeline of notes */}
      <div className="space-y-6">
        {Object.entries(groupedNotes).map(([date, dayNotes]) => (
          <div key={date} className="relative">
            <div className="flex items-center mb-2">
              <div className="bg-primary w-4 h-4 rounded-full z-10"></div>
              <div className="ml-3 font-medium">
                {format(new Date(date), "MMMM d, yyyy")}
              </div>
            </div>
            <div className="ml-2 border-l-2 border-muted pl-6 space-y-4">
              {dayNotes.map((note) => (
                <div
                  key={note.id}
                  className="relative bg-muted/20 dark:bg-muted/10 rounded-md p-3"
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-4">
                      <Input
                        value={editingNoteTitle}
                        onChange={(e) => setEditingNoteTitle(e.target.value)}
                        placeholder="Note title (optional)"
                        className="text-sm"
                      />
                      <Textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        className="min-h-[120px] text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEditing}
                          disabled={isLoading}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleUpdateNote(note.id!)}
                          disabled={isLoading || !editingNoteText.trim()}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          {note.title && (
                            <h3 className="font-semibold text-sm">
                              {note.title}
                            </h3>
                          )}
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(parseISO(note.timestamp), "h:mm a")}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => startEditing(note)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            onClick={() => handleDeleteNote(note.id!)}
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Note text - truncated with expand option */}
                      {note.text.length > 150 && note.id !== expandedNoteId ? (
                        <div>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {note.text.substring(0, 150)}...
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto text-xs mt-1"
                            onClick={() => setExpandedNoteId(note.id)}
                          >
                            Read more
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {note.text}
                          </p>
                          {note.id === expandedNoteId && (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto text-xs mt-1"
                              onClick={() => setExpandedNoteId(null)}
                            >
                              Show less
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
