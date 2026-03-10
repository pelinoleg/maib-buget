import { LineChart } from "@mui/x-charts/LineChart";

interface Props {
  data: { label: string; date: string; [key: string]: string | number | undefined }[];
  height: number;
  dataKey: string;
  color: string;
  tickInterval?: number;
  tooltipLabel?: string;
  formatTooltip?: (v: number) => string;
}

export default function MuiAreaChart({
  data,
  height,
  dataKey,
  color,
  tickInterval = 0,
  tooltipLabel,
  formatTooltip,
}: Props) {
  const dataset = data.map((d) => ({ ...d } as { [key: string]: string | number }));

  const tickLabelInterval = tickInterval > 0
    ? (_value: unknown, index: number) => index % (tickInterval + 1) === 0
    : undefined;

  return (
    <LineChart
      dataset={dataset}
      xAxis={[{
        scaleType: "band",
        dataKey: "label",
        tickLabelStyle: { fontSize: 9 },
        ...(tickLabelInterval ? { tickLabelInterval } : {}),
      }]}
      yAxis={[{
        tickLabelStyle: { fontSize: 9 },
        valueFormatter: (v: number) => v.toFixed(2),
      }]}
      series={[
        {
          dataKey,
          label: tooltipLabel || dataKey,
          color,
          area: true,
          showMark: false,
          valueFormatter: (v) =>
            v != null ? (formatTooltip ? formatTooltip(v as number) : (v as number).toFixed(4)) : "",
        },
      ]}
      height={height}
      hideLegend
      sx={{
        "& .MuiAreaElement-root": {
          fillOpacity: 0.15,
        },
      }}
    />
  );
}
