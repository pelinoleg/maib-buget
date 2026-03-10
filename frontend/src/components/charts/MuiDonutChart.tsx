import { PieChart, pieArcLabelClasses } from "@mui/x-charts/PieChart";
import { useDrawingArea } from "@mui/x-charts/hooks";

interface DataItem {
  category_id: number | null;
  name: string;
  total: number;
  color: string;
  has_children?: boolean;
}

interface Props {
  data: DataItem[];
  grandTotal: number;
  centerLabel: string;
  height: number;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  onPieClick?: (index: number) => void;
  formatValue: (v: number) => string;
  currLabel: string;
}

function CenterLabel({ top, bottom }: { top: string; bottom: string }) {
  const { width, height, left, top: areaTop } = useDrawingArea();
  return (
    <>
      <text
        x={left + width / 2}
        y={areaTop + height / 2 - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground"
        style={{ fontSize: 20, fontWeight: 700 }}
      >
        {top}
      </text>
      <text
        x={left + width / 2}
        y={areaTop + height / 2 + 14}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted-foreground"
        style={{ fontSize: 11 }}
      >
        {bottom}
      </text>
    </>
  );
}

export default function MuiDonutChart({
  data,
  grandTotal,
  centerLabel,
  height,
  innerRadius = 95,
  outerRadius = 180,
  showLabels = true,
  onPieClick,
  formatValue,
  currLabel,
}: Props) {
  const pieData = data.map((d, i) => ({
    id: i,
    value: d.total,
    label: d.name,
    color: d.color,
  }));

  return (
    <div style={{ width: "100%", height }}>
      <PieChart
        series={[
          {
            data: pieData,
            innerRadius,
            outerRadius,
            paddingAngle: 1,
            cornerRadius: 3,
            arcLabel: showLabels
              ? (item) => {
                  const pct = grandTotal > 0 ? (item.value / grandTotal) * 100 : 0;
                  return pct > 4 ? `${item.label} ${pct.toFixed(0)}%` : "";
                }
              : undefined,
            arcLabelMinAngle: 15,
            highlightScope: { fade: "global", highlight: "item" },
            highlighted: { additionalRadius: 4 },
            valueFormatter: ({ value }) =>
              `${formatValue(value)}${currLabel} (${grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(1) : 0}%)`,
          },
        ]}
        onItemClick={(_event, id) => {
          if (onPieClick && id.dataIndex != null) {
            onPieClick(id.dataIndex);
          }
        }}
        sx={{
          [`& .${pieArcLabelClasses.root}`]: {
            fontSize: "11px",
            fill: "var(--foreground)",
          },
          cursor: "pointer",
        }}
        hideLegend
        height={height}
      >
        <CenterLabel top={formatValue(grandTotal)} bottom={centerLabel} />
      </PieChart>
    </div>
  );
}
