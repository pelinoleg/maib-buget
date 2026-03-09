import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCategory, updateCategory, deleteCategory } from "@/lib/api";
import type { Category, SubCategory } from "./types";
import { COLORS } from "./types";

function textColorForBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1a1a1a" : "#ffffff";
}

interface Props {
  categories: Category[];
  reload: () => void;
}

export default function CategoriesTab({ categories, reload }: Props) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [newParent, setNewParent] = useState<string>("none");
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Build flat list of possible parents recursively (supports 3+ levels)
  const parentOptions: { id: number; label: string; depth: number }[] = [];
  const buildParentOptions = (subs: SubCategory[], prefix: string, depth: number) => {
    for (const sub of subs) {
      const label = prefix ? `${prefix} › ${sub.name}` : sub.name;
      parentOptions.push({ id: sub.id, label, depth });
      if (sub.subcategories?.length) {
        buildParentOptions(sub.subcategories, label, depth + 1);
      }
    }
  };
  for (const cat of categories) {
    parentOptions.push({ id: cat.id, label: cat.name, depth: 0 });
    buildParentOptions(cat.subcategories, cat.name, 1);
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createCategory({
      name: newName,
      color: newColor,
      parent_id: newParent !== "none" ? parseInt(newParent) : null,
    });
    setNewName("");
    setShowAddForm(false);
    reload();
  };

  const handleDelete = async (id: number) => {
    await deleteCategory(id);
    reload();
  };

  const startEditCat = (cat: { id: number; name: string; color: string }) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color);
  };

  const saveEditCat = async () => {
    if (editingCatId === null || !editCatName.trim()) return;
    await updateCategory(editingCatId, { name: editCatName.trim(), color: editCatColor });
    setEditingCatId(null);
    reload();
  };

  const renderChip = (cat: { id: number; name: string; color: string; transaction_count: number }, level: 0 | 1 | 2) => {
    if (editingCatId === cat.id) {
      return (
        <div key={cat.id} className="inline-flex flex-col gap-1.5 p-2 rounded-lg border bg-card">
          <div className="flex items-center gap-1">
            <Input
              value={editCatName}
              onChange={(e) => setEditCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditCat();
                if (e.key === "Escape") setEditingCatId(null);
              }}
              className="h-6 w-28 text-xs px-1.5"
              autoFocus
            />
            <button onClick={saveEditCat} className="p-0.5"><Check className="h-3.5 w-3.5 text-green-600" /></button>
            <button onClick={() => setEditingCatId(null)} className="p-0.5"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setEditCatColor(c)}
                className={`w-3.5 h-3.5 rounded-full transition-transform ${editCatColor === c ? "ring-2 ring-offset-1 ring-primary scale-110" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      );
    }

    const isParent = level === 0;

    return (
      <div
        key={cat.id}
        className={`group/chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors cursor-default ${
          isParent
            ? "text-sm font-medium hover:opacity-90"
            : "text-xs hover:bg-accent"
        }`}
        style={isParent
          ? { backgroundColor: cat.color, borderColor: cat.color, color: textColorForBg(cat.color) }
          : { borderColor: cat.color + "60" }
        }
      >
        {!isParent && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: cat.color }}
          />
        )}
        <span>{cat.name}</span>
        <span className={`text-[10px] ${isParent ? "opacity-60" : "text-muted-foreground"}`}>{cat.transaction_count}</span>
        <span className="inline-flex items-center gap-0.5 ml-0.5">
          <button onClick={() => startEditCat(cat)} className="p-0.5 rounded hover:bg-black/10">
            <Pencil className={`h-2.5 w-2.5 ${isParent ? "opacity-60 hover:opacity-100" : "text-muted-foreground hover:text-foreground"}`} />
          </button>
          <button onClick={() => handleDelete(cat.id)} className="p-0.5 rounded hover:bg-black/10">
            <Trash2 className={`h-2.5 w-2.5 ${isParent ? "opacity-60 hover:opacity-100" : "text-destructive"}`} />
          </button>
        </span>
      </div>
    );
  };

  const renderSubcategories = (subs: SubCategory[], level: 1 | 2) => {
    if (subs.length === 0) return null;
    const hasChildren = (s: SubCategory) => s.subcategories && s.subcategories.length > 0;
    return (
      <div className={`flex flex-wrap gap-1.5 ${level === 1 ? "ml-4" : "ml-8"}`}>
        {subs.map((sub) => (
          hasChildren(sub) && level === 1 ? (
            <div key={sub.id} className="w-full flex flex-col gap-1">
              {renderChip(sub, level)}
              <div className="flex flex-wrap gap-1.5 ml-4">
                {sub.subcategories.map((subsub) => renderChip(subsub, 2))}
              </div>
            </div>
          ) : (
            <div key={sub.id} className="inline-flex">
              {renderChip(sub, level)}
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Add button / form */}
      {!showAddForm ? (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" /> Adauga categorie
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-3">
            <Input
              placeholder="Nume categorie"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? "ring-2 ring-offset-1 ring-primary scale-110" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Select value={newParent} onValueChange={setNewParent}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Categorie parinte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fara parinte (nivel superior)</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.depth > 0 && <ChevronRight className="h-3 w-3 inline mr-1 text-muted-foreground" />}
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adauga
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setNewName(""); }}>
                Anuleaza
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories as grouped chips — 3 levels */}
      <div className="space-y-5">
        {categories.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1.5">{renderChip(cat, 0)}</div>
            {renderSubcategories(cat.subcategories, 1)}
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          Nu exista categorii. Adauga prima categorie mai sus.
        </p>
      )}
    </div>
  );
}
