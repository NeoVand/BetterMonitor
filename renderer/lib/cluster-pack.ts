/**
 * D3 Circle Packing visualization for process clusters
 * Separated from React for cleaner code and easier testing
 */

import * as d3 from 'd3';
import { getProcessColor } from './process-utils';

export interface PackNode {
  id: string;
  name: string;
  category?: string;
  processCount?: number;
  cpu?: number;
  mem?: number;
  value?: number;
  children?: PackNode[];
  processName?: string;
  pid?: number;
}

export interface ClusterPackOptions {
  width: number;
  height: number;
  coloredNames: Set<string>;
  selectedPid: number | null;
  onSelectCluster: (id: string | null) => void;
  onSelectProcess: (pid: number) => void;
}

export class ClusterPackVisualization {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private root: d3.HierarchyCircularNode<PackNode> | null = null;
  private focus: d3.HierarchyCircularNode<PackNode> | null = null;
  private view: [number, number, number] = [0, 0, 1];
  private diameter: number = 0;
  private isZooming = false;
  
  private circles: d3.Selection<SVGCircleElement, d3.HierarchyCircularNode<PackNode>, SVGGElement, unknown> | null = null;
  private labelGroups: d3.Selection<SVGGElement, d3.HierarchyCircularNode<PackNode>, SVGGElement, unknown> | null = null;
  private mainGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  
  private options: ClusterPackOptions;
  private currentDataHash: string = '';

  constructor(svgElement: SVGSVGElement, options: ClusterPackOptions) {
    this.svg = d3.select(svgElement);
    this.options = options;
  }

  private hashData(data: PackNode[]): string {
    // Simple hash based on structure - only rebuild if structure changes significantly
    const ids = this.collectIds(data);
    return ids.sort().join(',');
  }

  private collectIds(nodes: PackNode[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children) {
        ids.push(...this.collectIds(node.children));
      }
    }
    return ids;
  }

  render(data: PackNode[], forceRebuild = false) {
    if (data.length === 0) return;
    
    const newHash = this.hashData(data);
    const structureChanged = newHash !== this.currentDataHash;
    
    // Only rebuild if structure changed or forced
    if (!structureChanged && !forceRebuild && this.root) {
      // Just update colors/stats without rebuilding
      this.updateExistingNodes(data);
      return;
    }
    
    this.currentDataHash = newHash;
    this.svg.selectAll('*').remove();
    
    const { width, height } = this.options;
    const size = Math.min(width, height);
    this.diameter = size - 8;
    
    if (this.diameter <= 0) return;

    // Build hierarchy
    const rootData: PackNode = { id: 'root', name: 'root', children: data };
    
    const hierarchy = d3.hierarchy(rootData)
      .sum(d => (d as PackNode).value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const pack = d3.pack<PackNode>()
      .size([this.diameter, this.diameter])
      .padding(3);

    this.root = pack(hierarchy);
    this.focus = this.root;
    this.view = [this.root.x, this.root.y, this.root.r * 2];

    // Create main group for all elements
    this.mainGroup = this.svg.append('g');

    // Background for click handling
    this.svg.insert('rect', ':first-child')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', (event) => {
        event.stopPropagation();
        if (this.focus !== this.root) {
          this.zoomTo(this.root!);
          this.options.onSelectCluster(null);
        }
      });

    // Draw circles
    this.circles = this.mainGroup.selectAll<SVGCircleElement, d3.HierarchyCircularNode<PackNode>>('circle.node')
      .data(this.root.descendants().slice(1))
      .join('circle')
      .attr('class', 'node')
      .attr('fill', d => this.getFillColor(d))
      .attr('stroke', d => this.getStrokeColor(d))
      .attr('stroke-width', d => this.isSelected(d) ? 3 : 1.5)
      .attr('stroke-opacity', d => this.isSelected(d) ? 1 : 0.7)
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => this.handleMouseEnter(d))
      .on('mouseleave', (_, d) => this.handleMouseLeave(d))
      .on('click', (event, d) => this.handleClick(event, d));

    // Label groups
    this.labelGroups = this.mainGroup.selectAll<SVGGElement, d3.HierarchyCircularNode<PackNode>>('g.label-group')
      .data(this.root.descendants().slice(1))
      .join('g')
      .attr('class', 'label-group')
      .attr('pointer-events', 'none')
      .style('opacity', d => d.parent === this.focus ? 1 : 0)
      .style('visibility', d => d.parent === this.focus ? 'visible' : 'hidden');

    this.labelGroups.each((d, i, nodes) => this.renderLabel(d3.select(nodes[i]), d));

    // Initial position
    this.applyTransform();
  }

  private updateExistingNodes(_data: PackNode[]) {
    // Update colors without rebuilding - just refresh the visual properties
    this.circles
      ?.attr('fill', d => this.getFillColor(d))
      .attr('stroke', d => this.getStrokeColor(d))
      .attr('stroke-width', d => this.isSelected(d) ? 3 : 1.5)
      .attr('stroke-opacity', d => this.isSelected(d) ? 1 : 0.7);
  }

  private getNodeColor(d: d3.HierarchyCircularNode<PackNode>): string {
    return getProcessColor(d.data.processName, d.data.category, this.options.coloredNames);
  }

  private getFillColor(d: d3.HierarchyCircularNode<PackNode>): string {
    const baseColor = this.getNodeColor(d);
    if (d.depth === 0) return 'transparent';
    const opacity = d.depth === 1 ? 0.2 : d.depth === 2 ? 0.35 : 0.5;
    const color = d3.color(baseColor);
    return color ? color.copy({ opacity }).formatRgb() : baseColor;
  }

  private getStrokeColor(d: d3.HierarchyCircularNode<PackNode>): string {
    return this.isSelected(d) ? '#fff' : this.getNodeColor(d);
  }

  private isSelected(d: d3.HierarchyCircularNode<PackNode>): boolean {
    const pid = this.options.selectedPid;
    if (!pid) return false;
    if (d.data.pid === pid || d.data.id === `proc-${pid}`) return true;
    // Check if any child contains the selected PID
    if (d.children) {
      return d.descendants().some(child => child.data.pid === pid || child.data.id === `proc-${pid}`);
    }
    return false;
  }

  private handleMouseEnter(d: d3.HierarchyCircularNode<PackNode>) {
    if (!this.isSelected(d) && this.circles) {
      this.circles.filter(n => n === d)
        .attr('stroke-width', 2.5)
        .attr('stroke-opacity', 1);
    }
  }

  private handleMouseLeave(d: d3.HierarchyCircularNode<PackNode>) {
    if (!this.isSelected(d) && this.circles) {
      this.circles.filter(n => n === d)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.7);
    }
  }

  private handleClick(event: MouseEvent, d: d3.HierarchyCircularNode<PackNode>) {
    event.stopPropagation();

    // Process leaf node - select it
    if (d.data.id.startsWith('proc-')) {
      const pid = parseInt(d.data.id.replace('proc-', ''));
      this.options.onSelectProcess(pid);
      return;
    }

    // Cluster or category node
    if (this.focus === d) {
      // Already focused on this node - zoom out to parent
      if (d.parent) {
        this.zoomTo(d.parent);
        this.options.onSelectCluster(d.parent.depth === 0 ? null : d.parent.data.id);
      }
    } else {
      // Zoom into this node
      this.zoomTo(d);
      this.options.onSelectCluster(d.data.id);
    }
  }

  private applyTransform() {
    const { width, height } = this.options;
    const k = this.diameter / this.view[2];
    const cx = width / 2;
    const cy = height / 2;

    this.circles
      ?.attr('cx', d => (d.x - this.view[0]) * k + cx)
      .attr('cy', d => (d.y - this.view[1]) * k + cy)
      .attr('r', d => d.r * k);

    this.labelGroups
      ?.attr('transform', d => `translate(${(d.x - this.view[0]) * k + cx}, ${(d.y - this.view[1]) * k + cy})`);
  }

  private zoomTo(target: d3.HierarchyCircularNode<PackNode>) {
    if (this.isZooming) return;
    this.isZooming = true;
    this.focus = target;

    const targetView: [number, number, number] = [target.x, target.y, target.r * 2];

    this.svg.transition()
      .duration(600)
      .tween('zoom', () => {
        const interp = d3.interpolateZoom(this.view, targetView);
        return (t: number) => {
          this.view = interp(t) as [number, number, number];
          this.applyTransform();
        };
      })
      .on('end', () => {
        this.isZooming = false;
      });

    // Update label visibility
    this.labelGroups
      ?.transition()
      .duration(600)
      .style('opacity', n => n.parent === target ? 1 : 0)
      .on('end', function(n) {
        d3.select(this).style('visibility', n.parent === target ? 'visible' : 'hidden');
      });
  }

  private renderLabel(g: d3.Selection<SVGGElement, unknown, null, undefined>, d: d3.HierarchyCircularNode<PackNode>) {
    const name = d.data.name;
    const fontSize = d.depth === 1 ? 11 : d.depth === 2 ? 9 : 8;
    const maxWidth = d.r * 1.5;
    const charWidth = fontSize * 0.5;
    const maxChars = Math.max(2, Math.floor(maxWidth / charWidth));

    // Word wrap
    const words = name.split(/[\s-]+/);
    const lines: string[] = [];
    let line = '';

    for (const word of words) {
      if ((line + ' ' + word).trim().length <= maxChars) {
        line = (line + ' ' + word).trim();
      } else {
        if (line) lines.push(line);
        line = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 2) {
      lines.splice(2);
      lines[1] = lines[1].slice(0, -1) + '…';
    }

    const lineHeight = fontSize * 1.15;
    const startY = -((lines.length - 1) * lineHeight) / 2;

    lines.forEach((text, i) => {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('y', startY + i * lineHeight)
        .style('font-family', 'Inter, system-ui, sans-serif')
        .style('font-size', `${fontSize}px`)
        .style('font-weight', d.depth === 1 ? '700' : '500')
        .style('fill', '#fff')
        .text(text);
    });

    // Stats
    if (d.depth <= 2 && maxChars >= 4) {
      const count = d.data.processCount || d.children?.length || 0;
      const cpu = d.data.cpu || 0;
      const stats = cpu > 1 ? `${cpu.toFixed(0)}%` : count > 0 ? `${count}` : '';
      if (stats) {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('y', startY + lines.length * lineHeight + 2)
          .style('font-family', 'Inter, system-ui, sans-serif')
          .style('font-size', '8px')
          .style('fill', 'rgba(255,255,255,0.5)')
          .text(stats);
      }
    }
  }

  updateColors(coloredNames: Set<string>, selectedPid: number | null) {
    this.options.coloredNames = coloredNames;
    this.options.selectedPid = selectedPid;

    this.circles
      ?.attr('fill', d => this.getFillColor(d))
      .attr('stroke', d => this.getStrokeColor(d))
      .attr('stroke-width', d => this.isSelected(d) ? 3 : 1.5)
      .attr('stroke-opacity', d => this.isSelected(d) ? 1 : 0.7);
  }

  updateDimensions(width: number, height: number) {
    this.options.width = width;
    this.options.height = height;
    const size = Math.min(width, height);
    this.diameter = size - 8;
    
    if (this.root && this.diameter > 0) {
      this.applyTransform();
    }
  }

  destroy() {
    this.svg.selectAll('*').remove();
    this.root = null;
    this.focus = null;
    this.circles = null;
    this.labelGroups = null;
    this.mainGroup = null;
    this.currentDataHash = '';
  }
}
