import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/** Thin ECharts wrapper — a full `echarts-for-react` dependency isn't worth it for "init once, setOption on data change, dispose on unmount". */
export function Chart({
  option,
  height = 280,
}: {
  option: echarts.EChartsOption;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    const onResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
