import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type PeriodPresetKey,
  formatPresetLabel,
  canStepForward,
} from "@/lib/periodPresets";

export interface FilterState {
  periodPreset: PeriodPresetKey | null;
  periodOffset: number;
  dateFrom: string;
  dateTo: string;
  accountId: string;
  categoryId: string;
  type: string;
  search: string;
}

interface Props {
  activePreset: PeriodPresetKey | null;
  presetOffset: number;
  onSelectPreset: (key: PeriodPresetKey | null, offset: number) => void;
  currentFilters: FilterState;
  onApplyFilter: (filter: FilterState) => void;
}

export default function PeriodPresetBar({
  activePreset,
  presetOffset,
  onSelectPreset,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* Period nav */}
      {activePreset ? (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onSelectPreset(activePreset, presetOffset - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-center whitespace-nowrap">
            {formatPresetLabel(activePreset, presetOffset)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={!canStepForward(activePreset, presetOffset)}
            onClick={() => onSelectPreset(activePreset, presetOffset + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : <div />}
    </div>
  );
}
