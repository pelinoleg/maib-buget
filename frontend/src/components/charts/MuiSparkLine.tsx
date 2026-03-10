import { LineChart, areaElementClasses, lineElementClasses } from "@mui/x-charts/LineChart";

interface Props {
  data: number[];
  labels?: string[];
  height: number;
  width?: number | string;
  color: string;
  area?: boolean;
  tooltipFormatter?: (v: number, label?: string) => string;
}

export default function MuiSparkLine({
  data,
  labels,
  height,
  width = "100%",
  color,
  area = true,
  tooltipFormatter,
}: Props) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const padding = (max - min) * 0.1 || 1;

  const dataset = data.map((v, i) => ({
    value: v,
    label: labels?.[i] ?? String(i),
  } as { [key: string]: string | number }));

  return (
    <div style={{ width, height }}>
      <LineChart
        dataset={dataset}
        xAxis={[{
          scaleType: "band",
          dataKey: "label",
          tickLabelStyle: { fontSize: 9 },
        }]}
        yAxis={[{
          min: min - padding,
          max: max + padding,
          tickLabelStyle: { fontSize: 9 },
          valueFormatter: (v: number) => v.toFixed(2),
        }]}
        series={[
          {
            dataKey: "value",
            color,
            area,
            showMark: false,
            valueFormatter: (v) =>
              v != null
                ? tooltipFormatter
                  ? tooltipFormatter(v as number)
                  : (v as number).toFixed(2)
                : "",
          },
        ]}
        height={height}
        hideLegend
        margin={{ top: 8, bottom: 24, left: 40, right: 8 }}
        sx={{
          [`& .${areaElementClasses.root}`]: { fillOpacity: 0.15 },
          [`& .${lineElementClasses.root}`]: { strokeWidth: 2 },
        }}
      />
    </div>
  );
}
