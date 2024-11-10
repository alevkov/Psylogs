import { useEffect, useRef } from 'react';
import p5 from 'p5';
import { DoseEntry } from '@/lib/constants';

interface P5VisualizationProps {
  doses: Array<{
    timestamp: string;
    substance: string;
    amount: number;
    unit: string;
  }>;
  width?: number;
  height?: number;
}

export function P5Visualization({ doses, width = 400, height = 300 }: P5VisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Instance = useRef<p5 | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      let particles: Array<{ x: number; y: number; size: number; color: string; speed: number }> = [];
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
        '#D4A5A5', '#9E9E9E', '#58B19F', '#FFD93D', '#6C5B7B'
      ];

      p.setup = () => {
        p.createCanvas(width, height);
        p.noStroke();
        
        // Create particles based on doses
        doses.forEach((dose, index) => {
          const timestamp = new Date(dose.timestamp).getTime();
          const now = new Date().getTime();
          const age = (now - timestamp) / (1000 * 60 * 60 * 24); // days
          
          particles.push({
            x: p.random(width),
            y: p.random(height),
            size: p.map(dose.amount, 0, Math.max(...doses.map(d => d.amount)), 5, 20),
            color: colors[index % colors.length],
            speed: p.map(age, 0, 30, 2, 0.5) // Newer doses move faster
          });
        });
      };

      p.draw = () => {
        p.background(255, 20); // Semi-transparent background for trails
        
        particles.forEach((particle, index) => {
          // Update position with perlin noise for organic movement
          const noise = p.noise(particle.x * 0.01, particle.y * 0.01, p.frameCount * 0.01);
          particle.x += p.cos(noise * p.TWO_PI) * particle.speed;
          particle.y += p.sin(noise * p.TWO_PI) * particle.speed;
          
          // Wrap around edges
          particle.x = (particle.x + width) % width;
          particle.y = (particle.y + height) % height;
          
          // Draw particle
          p.fill(particle.color + '80'); // Add transparency
          p.circle(particle.x, particle.y, particle.size);
          
          // Draw connections between related substances
          doses.forEach((dose, i) => {
            if (i !== index && dose.substance === doses[index].substance) {
              const other = particles[i];
              const d = p.dist(particle.x, particle.y, other.x, other.y);
              if (d < 100) {
                p.stroke(particle.color + '40');
                p.line(particle.x, particle.y, other.x, other.y);
                p.noStroke();
              }
            }
          });
        });
      };
    };

    p5Instance.current = new p5(sketch, containerRef.current);

    return () => {
      p5Instance.current?.remove();
    };
  }, [doses, width, height]);

  return <div ref={containerRef} />;
}
