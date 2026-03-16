import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { generateTextFromGemini } from './services/gemini';
import { withRetry } from './services/geminiRetry';
import type {
  AICluster,
  ClusterRecord,
  PaperRecord,
  ScenarioPack,
  ClusterRelationship,
} from './types';
import { SCENARIO_PACKS } from './data/starterPapers';
import { generateAIClusters } from './services/generateAIClusters';
import { generateResearchImage } from './services/generateResearchImage';
import { createPaperFromLink } from './services/createPaperFromLink';
import { enrichPaperFromUrl } from './services/enrichPaperFromURL';
import { generateClusterRelationships } from './services/generateClusterRelationships';
import {
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  useEdgesState,
  useNodesState,
  BaseEdge,
  getStraightPath,
  type EdgeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ClusterNode from './components/nodes/ClusterNode';
import {
  Search,
  Zap,
  Plus,
  FileText,
  LayoutDashboard,
  Network,
  Database,
  Calendar,
  Send,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Activity,
  Globe,
  Share2,
  Sparkles,
  Menu,
  ExternalLink,
  Trash2,
  RotateCcw,
  Lock,
  Download,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import './index.css';
import LiveByFlashLogo from './components/LiveByFlashLogo';

const nodeTypes: NodeTypes = {
  cluster: ClusterNode,
};

function PerimeterEdge(props: EdgeProps) {
  const { id, data, style, markerEnd } = props;
  if (!data) return null;
  const { sx, sy, tx, ty } = data as any;
  const [edgePath] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} className={(props as any).className} />
  );
}

const edgeTypes = {
  perimeter: PerimeterEdge,
};

const MAX_FRONTIERS = 12;

function isDefaultFrontierName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === 'new research frontier' ||
    normalized === 'new frontier' ||
    normalized === 'untitled frontier'
  );
}

function buildClustersFromAI(papers: PaperRecord[], aiClusters: AICluster[]): ClusterRecord[] {
  const paperMap = new Map(papers.map((p) => [p.id, p]));

  return aiClusters
    .map((cluster): ClusterRecord | null => {
      const clusterPapers = cluster.paperIds
        .map((id) => paperMap.get(id))
        .filter((p): p is PaperRecord => !!p);

      if (clusterPapers.length === 0) return null;

      return {
        id: cluster.label,
        theme: cluster.label,
        locationLabel: cluster.label,
        subtitle: cluster.subtitle,
        papers: clusterPapers,
        paperCount: clusterPapers.length,
      };
    })
    .filter((c): c is ClusterRecord => !!c);
}

function buildRadialFlow(
  clusters: ClusterRecord[],
  relationships: ClusterRelationship[],
  viewMode: string,
  isExporting?: boolean,
): { nodes: Node[]; edges: Edge[] } {
  if (clusters.length === 0) return { nodes: [], edges: [] };

  const colors = ['#38BDF8', '#22C55E', '#A855F7', '#F97316', '#EC4899'];
  const radius = clusters.length <= 3 ? 220 : 280;
  const verticalSquash = 0.75;

  const nodes: Node[] = clusters.map((cluster, i) => {
    const angle = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;

    return {
      id: cluster.id,
      type: 'cluster',
      origin: [0.5, 0.5],
      data: {
        label: cluster.theme,
        subtitle: cluster.subtitle,
        paperCount: cluster.paperCount,
        color: colors[i % colors.length],
        clusterId: cluster.id,
        viewMode,
        exportMode: isExporting,
      },
      position: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * verticalSquash,
      },
      draggable: false,
      selectable: true,
    };
  });

  const nodeRadius = viewMode === 'illustrated' ? 62 : 54;
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

  const edges: Edge[] = (relationships.map((rel) => {
    const sourceNode = nodeLookup.get(rel.source);
    const targetNode = nodeLookup.get(rel.target);

    if (!sourceNode || !targetNode) return null;

    const sourceX = sourceNode.position.x;
    const sourceY = sourceNode.position.y;
    const targetX = targetNode.position.x;
    const targetY = targetNode.position.y;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / dist;
    const uy = dy / dist;

    const sourceEdgeX = sourceX + ux * nodeRadius;
    const sourceEdgeY = sourceY + uy * nodeRadius;

    const targetEdgeX = targetX - ux * nodeRadius;
    const targetEdgeY = targetY - uy * nodeRadius;

    const isAgreement = rel.type === 'agreement';
    const isDisagreement = rel.type === 'disagreement';
    const isWeak = rel.type === 'weak';

    return {
      id: `${rel.type}-${rel.source}-${rel.target}`,
      source: rel.source,
      target: rel.target,
      type: 'perimeter',
      data: {
        sx: sourceEdgeX,
        sy: sourceEdgeY,
        tx: targetEdgeX,
        ty: targetEdgeY,
        reason: rel.reason,
        relationshipType: rel.type,
      },
      style: {
        stroke: isAgreement ? '#38BDF8' : isDisagreement ? '#ef4444' : '#7dd3fc',
        strokeWidth: isWeak ? 2 : 2.5,
        strokeDasharray: isWeak ? '8 6' : undefined,
        opacity: isWeak ? 0.9 : 0.85,
      },
      className: isWeak ? 'edge-weak' : undefined,
    };
  }) as (Edge | null)[]).filter((e): e is Edge => e !== null);

  return { nodes, edges };
}

function parseUploadedPaperFile(text: string): PaperRecord[] {
  const parsed = JSON.parse(text);
  const data = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.papers)
      ? parsed.papers
      : null;

  if (!Array.isArray(data)) {
    throw new Error(
      'Paper file must be a JSON array or an object with a "papers" array.',
    );
  }

  return data.map((item: any, index: number) => {
    return {
      id: String(item.id ?? `paper-${index + 1}`),
      title: String(item.title ?? `Untitled paper ${index + 1}`),
      authors: Array.isArray(item.authors) ? item.authors : ['Unknown authors'],
      abstract: String(item.abstract ?? item.text ?? ''),
      theme: String(item.theme ?? 'Uncategorized'),
      locationLabel: String(
        item.locationLabel ??
          item.location ??
          item.geo_location?.label ??
          'Unknown location',
      ),
      citation: String(item.citation ?? ''),
      year: Number(item.year ?? new Date().getFullYear()),
      sourceUrl: String(item.sourceUrl ?? ''),
    };
  });
}

function findClusterIdForPaper(paperId: string, clusters: ClusterRecord[]): string | null {
  const cluster = clusters.find((c) => c.papers.some((p) => p.id === paperId));
  return cluster?.id ?? null;
}

type NoteAttachment = {
  id: string;
  type: 'cluster-image' | 'illustrated-world';
  timestamp: string;
  filename: string;
  dataUrl?: string;
};

type FrontierNotes = {
  text: string;
  attachments: NoteAttachment[];
};

export default function App() {
  const [activeScenario, setActiveScenario] = useState<ScenarioPack | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioPack[]>(SCENARIO_PACKS);
  const [aiClusters, setAiClusters] = useState<AICluster[]>([]);
  const [clusterRelationships, setClusterRelationships] = useState<ClusterRelationship[]>([]);
  const [queryText, setQueryText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [rightSidebarTab, setRightSidebarTab] = useState<'agent' | 'notes'>('agent');
  const [frontierNotes, setFrontierNotes] = useState<Record<string, FrontierNotes>>({});
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string; exchangeId?: string }>>([
    { id: 'initial', role: 'assistant', text: 'What would you like to explore today?', exchangeId: 'initial' },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [trashedPaperIds, setTrashedPaperIds] = useState<Set<string>>(new Set());
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [targetScenarioId, setTargetScenarioId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [expandedFrontierIds, setExpandedFrontierIds] = useState<Set<string>>(
  new Set(SCENARIO_PACKS.length > 0 ? [SCENARIO_PACKS[0].id] : [])
  );
  const [trashedScenarios, setTrashedScenarios] = useState<ScenarioPack[]>([]);
  const [viewMode, setViewMode] = useState<'illustrated' | 'graph' | 'table'>('graph');
  const [researchImage, setResearchImage] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'running' | 'complete'>('idle');
  const [reasoningStep, setReasoningStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportImageUrl, setExportImageUrl] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'cluster-image' | 'illustrated-world' | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState<{ type: 'papers' | 'frontiers'; packId?: string } | null>(null);
  const vizAreaRef = useRef<HTMLDivElement>(null);
  const graphStageRef = useRef<HTMLDivElement>(null);
  const illustratedStageRef = useRef<HTMLDivElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const footerUploadRef = useRef<HTMLInputElement | null>(null);

  const allPapers = useMemo(() => activeScenario?.papers ?? [], [activeScenario]);

  const papers = useMemo(
    () => allPapers.filter((p) => !trashedPaperIds.has(p.id)),
    [allPapers, trashedPaperIds],
  );

  const trashedPapers = useMemo(
    () => allPapers.filter((p) => trashedPaperIds.has(p.id)),
    [allPapers, trashedPaperIds],
  );

  const clusters = useMemo(
    () => buildClustersFromAI(papers, aiClusters),
    [papers, aiClusters],
  );

  const hasAnalyzed = aiClusters.length > 0;
  const hasClusters = clusters.length > 0;
  const canUseIllustrated = hasAnalyzed && hasClusters;
  const canUseGraph = papers.length > 0;
  const showEmptyGraphState = viewMode === 'graph' && !hasClusters;

  const flowData = useMemo(
    () => buildRadialFlow(clusters, clusterRelationships, viewMode, isExporting),
    [clusters, clusterRelationships, viewMode, isExporting],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowData.edges);

  useEffect(() => {
    setNodes(flowData.nodes);
    setEdges(flowData.edges);
  }, [flowData, setNodes, setEdges]);

  useEffect(() => {
    if (!activeScenario && scenarios.length > 0) {
      setActiveScenario(scenarios[0]);
    }
  }, [activeScenario, scenarios]);

  const selectedPaper = useMemo(
    () => papers.find((p) => p.id === selectedPaperId) ?? null,
    [papers, selectedPaperId],
  );

  const selectedCluster = useMemo(
    () => clusters.find((c) => c.id === selectedClusterId) ?? null,
    [clusters, selectedClusterId],
  );

  const pushAssistantMessage = useCallback((text: string) => {
    const id = Math.random().toString(36).substring(7);
    setChatMessages((prev) => [...prev, { id, role: 'assistant', text, exchangeId: id }]);
  }, []);

  const handleDeleteExchange = useCallback((exchangeId: string) => {
    setChatMessages((prev) => prev.filter(msg => msg.exchangeId !== exchangeId));
  }, []);

  const addAttachmentToNotes = useCallback((type: 'cluster-image' | 'illustrated-world', dataUrl?: string) => {
    if (!activeScenario) return;
    
    const newAttachment: NoteAttachment = {
      id: `att-${Date.now()}`,
      type,
      timestamp: new Date().toISOString(),
      filename: type === 'cluster-image' ? 'clusters-export.png' : 'world-export.png',
      dataUrl
    };

    setFrontierNotes(prev => {
      const current = prev[activeScenario.id] || { text: '', attachments: [] };
      return {
        ...prev,
        [activeScenario.id]: {
          ...current,
          attachments: [newAttachment, ...current.attachments]
        }
      };
    });
    
    pushAssistantMessage(`Added ${type === 'cluster-image' ? 'Cluster Map' : 'Illustrated World'} export to Notes.`);
  }, [activeScenario, pushAssistantMessage]);

  const sendAgentQuery = useCallback(async (text?: string) => {
    const finalText = (text ?? queryText).trim();
    if (!finalText || !activeScenario) return;

    const exchangeId = Math.random().toString(36).substring(7);
    const userMsgId = Math.random().toString(36).substring(7);

    setChatMessages((prev) => [...prev, { id: userMsgId, role: 'user', text: finalText, exchangeId }]);
    setQueryText('');

    try {
      const frontierContext = `Frontier: ${activeScenario.name}\nDescription: ${activeScenario.description}`;
      
      const paperContext = papers
        .map(p => `- ${p.title} (${p.year}): ${p.abstract}`)
        .join('\n');

      const clusterContext = clusters.length > 0 
        ? `Clusters detected: ${clusters.map(c => c.theme).join(', ')}`
        : 'No clusters analyzed yet.';

      const prompt = `
You are the Frontier Agent, a research assistant for the "${activeScenario.name}" research frontier.

Context:
${frontierContext}

Papers in this frontier:
${paperContext}

${clusterContext}

User Question:
${finalText}

Answer the user's question based on the provided research context. Be concise, professional, and insightful.
`.trim();

      const response = await withRetry(() => generateTextFromGemini(prompt));
      
      const assistantMsgId = Math.random().toString(36).substring(7);
      setChatMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', text: response, exchangeId },
      ]);
    } catch (error) {
      console.error('Gemini Q&A failed:', error);
      const errorMsgId = Math.random().toString(36).substring(7);
      setChatMessages((prev) => [
        ...prev,
        { id: errorMsgId, role: 'assistant', text: 'Gemini Q&A is unavailable right now. Please try again.', exchangeId },
      ]);
    }
  }, [queryText, activeScenario, papers, clusters]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    sendAgentQuery(question);
  }, [sendAgentQuery]);

  const handleAskFrontier = useCallback(() => {
    if (!activeScenario) return;

    const starter =
      queryText.trim() ||
      `Summarize the most important ideas in the ${activeScenario.name} frontier.`;

    sendAgentQuery(starter);
  }, [activeScenario, queryText, sendAgentQuery]);

  const handleKeyInsights = useCallback(() => {
    if (!activeScenario) return;
    const prompt = `Synthesize the major insights, areas of agreement, and open questions across the "${activeScenario.name}" frontier based on the available research papers.`;
    sendAgentQuery(prompt);
  }, [activeScenario, sendAgentQuery]);

  const handleResearchTimeline = useCallback(() => {
    if (!activeScenario) return;
    const prompt = `Construct a chronological research timeline across the "${activeScenario.name}" frontier using the papers and years available. Highlight key shifts in focus over time.`;
    sendAgentQuery(prompt);
  }, [activeScenario, sendAgentQuery]);

  const generateIllustratedWorld = useCallback(async () => {
    if (!canUseIllustrated) return;

    if (researchImage) {
      console.log('[DEBUG] App: researchImage already exists, skipping generation.');
      return;
    }

    if (!activeScenario) {
      console.warn('[DEBUG] App: No active scenario, cannot generate image.');
      return;
    }

    if (isGeneratingImage) {
      console.log('[DEBUG] App: Already generating image, skipping.');
      return;
    }

    setIsGeneratingImage(true);
    try {
      const themes =
        (aiClusters.length ? aiClusters : []).map((c) => c.label).join(', ') || activeScenario.name;

      console.log('[DEBUG] App: Generating image for themes:', themes);

      const imagePrompt = `
Cinematic scientific atlas landscape representing a living research frontier.

Themes:
${themes}

Visual style:
futuristic knowledge map, glowing constellations of research clusters,
distinct floating islands of scientific discovery, each with unique environmental features (urban, ecological, structural, civic) connected by luminous data lines,
deep navy and midnight blue environment, subtle nebula clouds,
volumetric lighting, atmospheric depth, high-detail digital matte painting.

Mood:
intelligent, exploratory, elegant, mysterious.

Composition:
ultra-wide 16:9 panorama,
large negative space in the center for interface overlays,
soft glowing highlights where knowledge clusters emerge.

Style references:
science visualization, AI knowledge graph, Palantir-style data map,
premium technology interface background, cinematic lighting.
      `.trim();

      console.log('[DEBUG] App: Calling generateResearchImage with prompt length:', imagePrompt.length);
      const image = await generateResearchImage(imagePrompt);

      if (image) {
        console.log('[DEBUG] App: Image generation successful, calling setResearchImage.');
        setResearchImage(image);
      } else {
        console.warn('[DEBUG] App: generateResearchImage returned null. Will use fallback.');
      }
    } catch (err) {
      console.error('[DEBUG] App: generateIllustratedWorld caught error:', err);
    } finally {
      setIsGeneratingImage(false);
    }
  }, [canUseIllustrated, researchImage, activeScenario, isGeneratingImage, aiClusters]);

  useEffect(() => {
    if (viewMode === 'illustrated') {
      if (!canUseIllustrated) {
        setViewMode('graph');
      } else {
        generateIllustratedWorld();
      }
    }
  }, [viewMode, canUseIllustrated, generateIllustratedWorld]);

  const handleAnalyzeFrontier = async () => {
    if (!activeScenario || isAnalyzing) return;

    setIsAnalyzing(true);
    setAnalysisPhase('running');
    setReasoningStep(0);

    // Reasoning sequence simulation
    const steps = [
      'reading source metadata',
      'detecting research themes',
      'clustering related papers',
      'mapping agreements and conflicts'
    ];

    try {
      // Start AI analysis in background
      const analysisPromise = generateAIClusters(activeScenario.papers);
      
      // Sequential reasoning display
      for (let i = 0; i < steps.length; i++) {
        setReasoningStep(i + 1);
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms per step
      }

      const result = await analysisPromise;
      const nextClusters = buildClustersFromAI(
        activeScenario.papers.filter((p) => !trashedPaperIds.has(p.id)),
        result,
      );

      const relationships = await generateClusterRelationships(nextClusters);
      
      // Set both together to minimize delay between nodes and edges appearing
      setAiClusters(result);
      setClusterRelationships(relationships);

      setAnalysisPhase('complete');
      pushAssistantMessage(`Landscape generated. ${nextClusters.length} clusters detected.`);
    } catch (err) {
      console.error('Cluster analysis failed', err);
      setAnalysisPhase('idle');
      pushAssistantMessage('Analysis failed. Gemini may be rate-limited or unavailable right now.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleScenarioSelect = useCallback((scenario: ScenarioPack) => {
    setActiveScenario(scenario);
    setSelectedPaperId(null);
    setSelectedClusterId(null);
    setTrashedPaperIds(new Set());
    setAiClusters([]);
    setClusterRelationships([]);
    setAnalysisPhase('idle');
    setReasoningStep(0);
    setQueryText('');
    setResearchImage(null);
    setViewMode('graph');
    setExpandedFrontierIds((prev) => new Set(prev).add(scenario.id));
  }, []);

  const handleCreateFrontier = useCallback(() => {
    if (scenarios.length >= MAX_FRONTIERS) {
      pushAssistantMessage(
        `Frontier bandwidth at capacity (12/12). \nTo map a new horizon, please decommission an existing frontier to reallocate agent resources.`
      );
      return;
    }

    const newScenario: ScenarioPack = {
      id: `frontier-${Date.now()}`,
      name: 'New Research Frontier',
      description: 'Empty workspace for research exploration.',
      papers: [],
    };

    setScenarios((prev) => [newScenario, ...prev]);
    setActiveScenario(newScenario);
    setSelectedPaperId(null);
    setSelectedClusterId(null);
    setTrashedPaperIds(new Set());
    setAiClusters([]);
    setClusterRelationships([]);
    setAnalysisPhase('idle');
    setReasoningStep(0);
    setQueryText('');
    setResearchImage(null);
    setViewMode('graph');
    setExpandedFrontierIds((prev) => new Set(prev).add(newScenario.id));
  }, []);

  const toggleFrontierExpand = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFrontierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRemoveScenario = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const scenarioToRemove = scenarios.find((s) => s.id === id);
      if (!scenarioToRemove) return;

      setScenarios((prev) => prev.filter((s) => s.id !== id));
      setTrashedScenarios((prev) => [scenarioToRemove, ...prev]);

      if (activeScenario?.id === id) {
        const remaining = scenarios.filter((s) => s.id !== id);
        setActiveScenario(remaining.length > 0 ? remaining[0] : null);
      }

      pushAssistantMessage(`Frontier "${scenarioToRemove.name}" moved to recycle bin.`);
    },
    [scenarios, activeScenario, pushAssistantMessage],
  );

  const handleRestoreScenario = useCallback(
    (id: string) => {
      const scenarioToRestore = trashedScenarios.find((s) => s.id === id);
      if (!scenarioToRestore) return;

      setTrashedScenarios((prev) => prev.filter((s) => s.id !== id));
      setScenarios((prev) => [scenarioToRestore, ...prev]);
      pushAssistantMessage(`Frontier "${scenarioToRestore.name}" restored.`);
    },
    [trashedScenarios, pushAssistantMessage],
  );

  const handleEmptyPaperBin = useCallback((packId: string) => {
    const pack = scenarios.find(s => s.id === packId);
    if (!pack) return;

    const idsToRemove = pack.papers
      .filter(p => trashedPaperIds.has(p.id))
      .map(p => p.id);

    if (idsToRemove.length === 0) return;

    setConfirmEmpty({ type: 'papers', packId });
  }, [scenarios, trashedPaperIds]);

  const executeEmptyPaperBin = (packId: string) => {
    const pack = scenarios.find(s => s.id === packId);
    if (!pack) return;

    const idsToRemove = pack.papers
      .filter(p => trashedPaperIds.has(p.id))
      .map(p => p.id);

    setScenarios((prev) =>
      prev.map((s) =>
        s.id === packId
          ? { ...s, papers: s.papers.filter((p) => !idsToRemove.includes(p.id)) }
          : s
      )
    );

    setActiveScenario((prev) =>
      prev?.id === packId
        ? { ...prev, papers: prev.papers.filter((p) => !idsToRemove.includes(p.id)) }
        : prev
    );

    setTrashedPaperIds((prev) => {
      const next = new Set(prev);
      idsToRemove.forEach(id => next.delete(id));
      return next;
    });

    pushAssistantMessage('Recycle bin cleared for this frontier.');
    setConfirmEmpty(null);
  };

  const handleEmptyFrontierBin = useCallback(() => {
    setConfirmEmpty({ type: 'frontiers' });
  }, []);

  const executeEmptyFrontierBin = () => {
    setTrashedScenarios([]);
    pushAssistantMessage('Frontier recycle bin cleared.');
    setConfirmEmpty(null);
  };

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>, targetScenarioId: string) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        const text = await file.text();
        const uploadedPapers = parseUploadedPaperFile(text);

        setScenarios((prev) =>
          prev.map((scenario) =>
            scenario.id === targetScenarioId
              ? { ...scenario, papers: [...scenario.papers, ...uploadedPapers] }
              : scenario,
          ),
        );

        setActiveScenario((prev) =>
          prev?.id === targetScenarioId
            ? { ...prev, papers: [...prev.papers, ...uploadedPapers] }
            : prev,
        );

        pushAssistantMessage(`Uploaded ${uploadedPapers.length} paper(s) into the selected frontier.`);
      } catch (error) {
        console.error(error);
        alert(
          'Upload failed. Please upload a valid .json or .txt file containing either a paper array or { "papers": [...] }.',
        );
      } finally {
        setIsUploading(false);
        event.target.value = '';
      }
    },
    [pushAssistantMessage],
  );

  const handleLinkAdd = async (url: string, scenarioIdOverride?: string) => {
    const scenarioId = scenarioIdOverride ?? targetScenarioId ?? activeScenario?.id;
    if (!scenarioId) return;

    const provisionalPaper = await createPaperFromLink(url);

    setScenarios((prev) =>
      prev.map((scenario) =>
        scenario.id === scenarioId
          ? { ...scenario, papers: [...scenario.papers, provisionalPaper] }
          : scenario,
      ),
    );

    setActiveScenario((prev) =>
      prev && prev.id === scenarioId
        ? { ...prev, papers: [...prev.papers, provisionalPaper] }
        : prev,
    );

    setSelectedPaperId(provisionalPaper.id);
    setSelectedClusterId(null);

    try {
      const enrichingPaper = {
        ...provisionalPaper,
        ingestStatus: 'enriching' as const,
      };

      setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === scenarioId
            ? {
                ...scenario,
                papers: scenario.papers.map((p) =>
                  p.id === provisionalPaper.id ? enrichingPaper : p,
                ),
              }
            : scenario,
        ),
      );

      setActiveScenario((prev) =>
        prev && prev.id === scenarioId
          ? {
              ...prev,
              papers: prev.papers.map((p) =>
                p.id === provisionalPaper.id ? enrichingPaper : p,
              ),
            }
          : prev,
      );

      const enrichedPaper = await enrichPaperFromUrl(enrichingPaper);

      setScenarios((prev) =>
        prev.map((scenario) => {
          if (scenario.id !== scenarioId) return scenario;

          let updatedName = scenario.name;
          if (isDefaultFrontierName(scenario.name)) {
            updatedName = enrichedPaper.theme || enrichedPaper.title || scenario.name;
          }

          return {
            ...scenario,
            name: updatedName,
            papers: scenario.papers.map((p) =>
              p.id === provisionalPaper.id ? enrichedPaper : p,
            ),
          };
        }),
      );

      setActiveScenario((prev) =>
        prev && prev.id === scenarioId
          ? {
              ...prev,
              name: isDefaultFrontierName(prev.name)
                ? enrichedPaper.theme || enrichedPaper.title || prev.name
                : prev.name,
              papers: prev.papers.map((p) =>
                p.id === provisionalPaper.id ? enrichedPaper : p,
              ),
            }
          : prev,
      );

      pushAssistantMessage('Research link added to the active frontier.');
    } catch (error) {
      console.error('Failed to enrich paper from link:', error);

      const failedPaper = {
        ...provisionalPaper,
        ingestStatus: 'failed' as const,
      };

      setScenarios((prev) =>
        prev.map((scenario) =>
          scenario.id === scenarioId
            ? {
                ...scenario,
                papers: scenario.papers.map((p) =>
                  p.id === provisionalPaper.id ? failedPaper : p,
                ),
              }
            : scenario,
        ),
      );

      setActiveScenario((prev) =>
        prev && prev.id === scenarioId
          ? {
              ...prev,
              papers: prev.papers.map((p) =>
                p.id === provisionalPaper.id ? failedPaper : p,
              ),
            }
          : prev,
      );

      pushAssistantMessage('The link was added, but enrichment failed.');
    }
  };

  const handleRemovePaper = (id: string) => {
    setTrashedPaperIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    if (selectedPaperId === id) {
      setSelectedPaperId(null);
      setSelectedClusterId(null);
    }
  };

  const handleRestorePaper = (id: string) => {
    setTrashedPaperIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleCopyFrontierLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setShareMenuOpen(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const waitForPaint = async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 100));
  };

  const handleExportClustersImage = async () => {
    const originalMode = viewMode;
    if (viewMode !== 'graph') {
      setViewMode('graph');
      await waitForPaint();
    }

    if (!graphStageRef.current) return;

    setExportType('cluster-image');

    // Fit view specifically for export with more padding
    if (rfInstance.current) {
      rfInstance.current.fitView({ padding: 0.25, duration: 0 });
      await waitForPaint();
    }

    setIsExporting(true);
    setShareMenuOpen(false);
    await waitForPaint();

    try {
      const stagePng = await toPng(graphStageRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: '#020617',
        width: graphStageRef.current.clientWidth * 1.3,
        height: graphStageRef.current.clientHeight * 1.3,
      });
      
      setExportImageUrl(stagePng);
      await waitForPaint();

      if (exportCardRef.current) {
        const finalPng = await toPng(exportCardRef.current, {
          pixelRatio: 3,
          cacheBust: true,
        });

        addAttachmentToNotes('cluster-image', finalPng);

        const link = document.createElement('a');
        link.download = `frontier-clusters-${activeScenario?.name.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.href = finalPng;
        link.click();
      }
    } catch (err) {
      console.error('Export failed', err);
      pushAssistantMessage('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
      setExportImageUrl(null);
      setExportType(null);
      
      // Restore live fitView
      if (rfInstance.current) {
        rfInstance.current.fitView({ padding: 0.1, duration: 0 });
      }
      
      if (originalMode !== 'graph') setViewMode(originalMode);
    }
  };

  const handleExportIllustratedWorld = async () => {
    const originalMode = viewMode;
    if (viewMode !== 'illustrated') {
      setViewMode('illustrated');
      await waitForPaint();
    }

    if (!illustratedStageRef.current) return;

    setExportType('illustrated-world');

    setIsExporting(true);
    setShareMenuOpen(false);
    await waitForPaint();

    try {
      const stagePng = await toPng(illustratedStageRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: '#020617',
        width: illustratedStageRef.current.clientWidth * 1.3,
        height: illustratedStageRef.current.clientHeight * 1.3,
      });
      
      setExportImageUrl(stagePng);
      await waitForPaint();

      if (exportCardRef.current) {
        const finalPng = await toPng(exportCardRef.current, {
          pixelRatio: 3,
          cacheBust: true,
        });

        addAttachmentToNotes('illustrated-world', finalPng);

        const link = document.createElement('a');
        link.download = `frontier-world-${activeScenario?.name.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.href = finalPng;
        link.click();
      }
    } catch (err) {
      console.error('Export failed', err);
      pushAssistantMessage('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
      setExportImageUrl(null);
      setExportType(null);
      if (originalMode !== 'illustrated') setViewMode(originalMode);
    }
  };

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const clusterId = (node.data as { clusterId?: string } | undefined)?.clusterId;
      if (!clusterId) return;

      setSelectedClusterId(clusterId);
      setSelectedPaperId(null);
    },
    [],
  );

  const openPaperDetails = useCallback((paperId: string) => {
    setSelectedPaperId(paperId);
    const clusterId = findClusterIdForPaper(paperId, clusters);
    if (clusterId) setSelectedClusterId(clusterId);
  }, [clusters]);

  console.log('Current researchImage:', researchImage ? researchImage.slice(0, 40) : null);

  return (
    <div className="h-screen w-screen flex flex-col bg-bg overflow-hidden text-slate-200">
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 z-50 bg-bg/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <LiveByFlashLogo size={40} />

          <div>
            <h1 className="text-lg font-display font-bold tracking-tight text-white uppercase">
              Live by Flash
            </h1>

            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
              AI Frontier Analysis Agent
            </p>
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-12">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder="Ask the Frontier anything..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-11 pr-12 text-sm focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAskFrontier();
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleAnalyzeFrontier}
            className="nav-button bg-accent/10 border-accent/20 text-accent hover:bg-accent/20"
            disabled={!activeScenario || isAnalyzing}
          >
            <Zap className="w-4 h-4" />
            <span>{isAnalyzing ? 'Analyzing...' : 'Analyze with Gemini'}</span>
          </button>

          <div className="h-8 w-px bg-white/10 mx-2" />

        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`border-r border-white/5 flex flex-col bg-bg/50 backdrop-blur-sm transition-all duration-300 ${
            isSidebarOpen ? 'w-80' : 'w-14'
          }`}
        >
          <div
            className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
              isSidebarOpen ? 'p-6 min-w-[320px]' : 'p-2 min-w-0 items-center'
            }`}
          >
            <div
              className={`mb-6 flex ${
                isSidebarOpen ? 'items-center justify-between' : 'justify-center'
              }`}
            >
              {isSidebarOpen && (
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">
                  Frontiers ({scenarios.length} / {MAX_FRONTIERS})
                </h2>
              )}

              <button
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {isSidebarOpen ? (
                  <ChevronLeft className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>

            {isSidebarOpen && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="pr-2 mb-4 shrink-0">
                  <button
                    onClick={handleCreateFrontier}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-accent/40 text-accent px-4 py-3 rounded-2xl font-bold text-sm hover:bg-accent/10 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Frontier</span>
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                  {scenarios.map((pack) => {
                    const isExpanded = expandedFrontierIds.has(pack.id);
                    const isActive = activeScenario?.id === pack.id;
                    const packPapers = pack.papers.filter((p) => !trashedPaperIds.has(p.id));
                    const packTrashedPapers = pack.papers.filter((p) => trashedPaperIds.has(p.id));

                    return (
                      <div
                        key={pack.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isActive
                            ? 'bg-white/10 border-accent/50'
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div
                          onClick={() => handleScenarioSelect(pack)}
                          className="p-4 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="text-sm font-semibold text-white line-clamp-1">
                                  {pack.name}
                                </h3>
                                <button
                                  onClick={(e) => toggleFrontierExpand(pack.id, e)}
                                  className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>
                              </div>

                              <p className="text-xs text-slate-400 line-clamp-2">
                                {pack.description}
                              </p>

                              <div className="flex items-center justify-between mt-4">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                                  {pack.papers.length} Sources
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="text-[8px] px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTargetScenarioId(pack.id);
                                      setPendingLinkUrl('');
                                      setShowLinkInput(true);
                                    }}
                                  >
                                    Upload Paper Links
                                  </button>
                                  <button
                                    onClick={(e) => handleRemoveScenario(pack.id, e)}
                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Delete Frontier"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 border-t border-white/5 bg-black/20">
                            <div className="space-y-2 mt-4">
                              {packPapers.map((paper, i) => (
                                <div
                                  key={paper.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isActive) handleScenarioSelect(pack);
                                    openPaperDetails(paper.id);
                                  }}
                                  className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all group ${
                                    selectedPaperId === paper.id
                                      ? 'bg-accent/20 border border-accent/30'
                                      : 'hover:bg-white/5 border border-transparent'
                                  }`}
                                >
                                  <div
                                    className="w-2 h-2 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                                    style={{
                                      backgroundColor: [
                                        '#38BDF8',
                                        '#22C55E',
                                        '#A855F7',
                                        '#F97316',
                                        '#EC4899',
                                      ][i % 5],
                                    }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-medium text-slate-200 group-hover:text-white transition-colors line-clamp-1">
                                      {paper.title}
                                    </h4>
                                    <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wider">
                                      {paper.theme} • {paper.year}
                                    </p>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemovePaper(paper.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}

                              {packTrashedPapers.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-white/5">
                                  <div className="flex items-center justify-between mb-2 px-1">
                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                                      Recycle Bin ({packTrashedPapers.length})
                                    </p>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEmptyPaperBin(pack.id);
                                      }}
                                      className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase tracking-widest transition-colors"
                                    >
                                      Empty
                                    </button>
                                  </div>
                                  {packTrashedPapers.map((paper) => (
                                    <div
                                      key={paper.id}
                                      className="flex items-center justify-between p-2 text-[10px] text-slate-500 bg-white/[0.02] rounded-lg mb-1"
                                    >
                                      <span className="line-clamp-1 flex-1">{paper.title}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRestorePaper(paper.id);
                                        }}
                                        className="hover:text-accent p-1 transition-colors"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {pack.papers.length === 0 && (
                                <p className="text-[10px] text-slate-500 italic text-center py-4">
                                  No papers in this frontier.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {trashedScenarios.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/10 pb-4">
                      <div className="flex items-center justify-between mb-3 px-2">
                        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Frontier Recycle Bin ({trashedScenarios.length})
                        </h2>
                        <button
                          type="button"
                          onClick={handleEmptyFrontierBin}
                          className="text-[9px] text-slate-500 hover:text-red-400 font-bold uppercase tracking-widest transition-colors"
                        >
                          Empty
                        </button>
                      </div>
                      <div className="space-y-2">
                        {trashedScenarios.map((pack) => (
                          <div
                            key={pack.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-slate-400"
                          >
                            <span className="line-clamp-1 font-medium">{pack.name}</span>
                            <button
                              onClick={() => handleRestoreScenario(pack.id)}
                              className="hover:text-accent p-1 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {isSidebarOpen && (
            <div className="p-6 border-t border-white/5 space-y-3 min-w-[320px]">
              <input
                ref={footerUploadRef}
                type="file"
                accept=".json,.txt,application/json,text/plain"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (activeScenario) handleUpload(e, activeScenario.id);
                }}
              />

              <button
                className="w-full flex items-center gap-3 text-xs text-slate-400 hover:text-white transition-colors"
                onClick={() => {
                  if (!activeScenario) {
                    pushAssistantMessage('Select a frontier before opening Notes.');
                    return;
                  }
                  setRightSidebarTab('notes');
                  setSelectedPaperId(null);
                  setSelectedClusterId(null);
                }}
              >
                <Database className="w-4 h-4" />
                <span>Notes</span>
              </button>
            </div>
          )}
        </aside>

        <main className="flex-1 relative bg-[#020617] overflow-hidden" ref={vizAreaRef}>
          {/* Hidden Export Card Composition Stage */}
          <div className="fixed left-[-9999px] top-0 pointer-events-none">
            <div 
              ref={exportCardRef}
              className="w-[1200px] h-[800px] bg-[#020617] flex flex-col p-12 relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4 z-10">
                <div className="flex items-center gap-4">
                  <LiveByFlashLogo size={54} />
                  <div>
                    <h1 className="text-xl font-display font-bold text-white tracking-tight uppercase leading-none mb-1">
                      Live by Flash
                    </h1>
                    <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-semibold">
                      AI Frontier Analysis Agent
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  <Sparkles className="w-3 h-3 text-accent" />
                  <span className="text-[9px] font-bold text-white uppercase tracking-[0.15em]">
                    Powered by Gemini AI
                  </span>
                </div>
              </div>

              {/* Main Framed Image Area */}
              <div className="flex-1 relative rounded-2xl border border-white/10 overflow-hidden bg-black/20 shadow-2xl z-10">
                {exportImageUrl && (
                  exportType === 'illustrated-world' ? (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                      <img
                        src={exportImageUrl}
                        alt="Export Stage"
                        referrerPolicy="no-referrer"
                        className="max-w-none h-[175%] w-auto translate-y-[10%] translate-x-[10%]"
                      />
                    </div>
                  ) : (
                    <img
                      src={exportImageUrl}
                      alt="Export Stage"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )
                )}
              </div>

              {/* Footer Panel */}
              <div className="mt-4 flex justify-between items-end z-10">
                <div className="flex flex-col gap-4 max-w-[500px] rounded-2xl border border-white/10 bg-[#020617]/80 backdrop-blur-md px-8 py-4 shadow-xl">
                  <div>
                    <h2 className="text-[10px] text-slate-400 uppercase tracking-[0.28em] font-bold mb-2">
                      The Future Of
                    </h2>
                    <h1 className="text-2xl font-display font-bold text-white uppercase tracking-tight leading-none">
                      {activeScenario?.name ?? 'Research Radar'}
                    </h1>
                  </div>
                  <div className="w-full h-[1px] bg-white/10 my-1" />
                  <div className="text-[11px] text-slate-300 leading-relaxed">
                    <span className="text-slate-400">Explore this frontier: </span>
                    <span className="text-accent break-all">{window.location.href}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#020617]/80 backdrop-blur-md px-6 py-5 shadow-xl space-y-4">
                  <div className="font-bold uppercase tracking-[0.2em] text-slate-400 text-[9px]">
                    Relationship Legend
                  </div>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-3 text-[10px] text-slate-200 uppercase tracking-wider font-medium">
                      <div className="w-6 border-t-2 border-sky-400" />
                      <span>Agreement</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-200 uppercase tracking-wider font-medium">
                      <div className="w-6 border-t-2 border-red-500" />
                      <span>Tradeoff</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-200 uppercase tracking-wider font-medium">
                      <div
                        className="w-6 border-t-2 border-slate-400"
                        style={{ borderTopStyle: 'dashed', borderTopWidth: '2px' }}
                      />
                      <span>Emerging</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background Decorative Elements */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full" />
              </div>
            </div>
          </div>

          <div ref={illustratedStageRef} className="absolute inset-0 overflow-visible">
            {viewMode === 'illustrated' && (
              <div
                className="absolute inset-0 z-0 transition-opacity duration-1000 bg-[#020617] overflow-hidden"
              >
                <img
                  src={researchImage || '/fallback-research-world.jpg'}
                  alt="Research World"
                  className="absolute inset-0 w-full h-full object-cover opacity-82"
                  referrerPolicy="no-referrer"
                />
                {/* Vignette and blending overlays */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/35 via-transparent to-[#020617]/35" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#020617]/20 via-transparent to-[#020617]/20" />
                <div className="absolute inset-0 shadow-[inset_0_0_70px_rgba(2,6,23,0.35)]" />
              </div>
            )}

            <div className="absolute inset-0 z-10 bg-black/5 pointer-events-none" />

            {!activeScenario ? (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="text-center text-slate-400">
                  <div className="text-5xl mb-4">📡</div>
                  <h2 className="text-2xl font-semibold text-white mb-2">Radar Standby</h2>
                  <p>Select or create a frontier to begin.</p>
                </div>
              </div>
            ) : viewMode === 'table' ? (
              <div className="absolute inset-0 z-20 px-24 pt-32 pb-24 overflow-auto">
                <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-4 text-xs uppercase tracking-widest text-slate-400 border-b border-white/10 bg-white/5">
                    <div className="p-4">Title</div>
                    <div className="p-4">Authors</div>
                    <div className="p-4">Theme</div>
                    <div className="p-4">Year</div>
                  </div>
                  {papers.map((paper) => (
                    <div
                      key={paper.id}
                      className="grid grid-cols-4 text-sm border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() => openPaperDetails(paper.id)}
                    >
                      <div className="p-4 text-white line-clamp-2">{paper.title}</div>
                      <div className="p-4 text-slate-300 line-clamp-1">
                        {paper.authors?.join(', ') || 'Unknown authors'}
                      </div>
                      <div className="p-4 text-slate-300 line-clamp-1">{paper.theme}</div>
                      <div className="p-4 text-slate-400">{paper.year}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : showEmptyGraphState ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center p-8 overflow-hidden">
                {/* Ambient Background Layers - Integrated Depth */}
                <div className="absolute inset-0 dormant-grid opacity-20 pointer-events-none" />
                <div className="absolute inset-0 scanline opacity-5 pointer-events-none" />
                <div 
                  className="absolute inset-0 pointer-events-none" 
                  style={{
                    background: `
                      radial-gradient(ellipse at 50% 40%, rgba(80, 150, 255, 0.12), rgba(40, 90, 160, 0.08), transparent 65%),
                      radial-gradient(ellipse at 50% 70%, rgba(30, 60, 120, 0.1), transparent 70%)
                    `
                  }}
                />
                
                {/* Latent Graph Hints - Very Subtle */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(6)].map((_, i) => (
                    <div 
                      key={i}
                      className="absolute w-1 h-1 bg-accent/10 rounded-full animate-slow-pulse"
                      style={{
                        left: `${20 + Math.random() * 60}%`,
                        top: `${20 + Math.random() * 60}%`,
                        animationDelay: `${i * 1.2}s`
                      }}
                    />
                  ))}
                  <svg className="absolute inset-0 w-full h-full opacity-[0.02] text-accent">
                    <line x1="25%" y1="35%" x2="45%" y2="55%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 12" />
                    <line x1="70%" y1="30%" x2="55%" y2="50%" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 12" />
                    <circle cx="40%" cy="40%" r="80" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 12" />
                  </svg>
                </div>

                {/* Integrated System Surface */}
                <div 
                  className="max-w-[560px] w-full text-center relative z-10 px-12 py-12 rounded-[40px] border border-white/[0.03] backdrop-blur-[6px]"
                  style={{
                    background: 'radial-gradient(ellipse at center, rgba(20, 40, 80, 0.5), rgba(10, 20, 40, 0.8))',
                    boxShadow: '0 0 80px rgba(60, 120, 200, 0.08)'
                  }}
                >
                  {analysisPhase === 'running' ? (
                    <div className="py-8 space-y-8">
                      <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 bg-accent/20 rounded-full animate-ping opacity-20" />
                        <div className="relative w-full h-full bg-accent/10 border border-accent/30 rounded-full flex items-center justify-center">
                          <Zap className="w-8 h-8 text-accent animate-pulse" />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h2 className="text-xl font-display font-medium text-white tracking-tight">
                          Analyzing frontier
                        </h2>
                        <div className="flex flex-col items-center gap-2">
                          {[
                            'reading source metadata',
                            'detecting research themes',
                            'clustering related papers',
                            'mapping agreements and conflicts'
                          ].map((step, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ 
                                opacity: reasoningStep > idx ? 1 : 0.3,
                                y: reasoningStep > idx ? 0 : 5
                              }}
                              className="flex items-center gap-3 text-xs"
                            >
                              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${reasoningStep > idx ? 'bg-accent shadow-[0_0_8px_rgba(56,189,248,0.6)]' : 'bg-white/10'}`} />
                              <span className={reasoningStep > idx ? 'text-slate-200' : 'text-slate-500'}>
                                {step}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Refined Icon Badge */}
                      <div className="relative w-20 h-20 mx-auto mb-6">
                        <div 
                          className="absolute inset-0 rounded-full blur-2xl pointer-events-none" 
                          style={{
                            background: 'radial-gradient(circle, rgba(80, 150, 255, 0.12), transparent 60%)'
                          }}
                        />
                        <div className="w-full h-full bg-white/[0.03] border border-white/10 rounded-full flex items-center justify-center shadow-inner relative z-10">
                          <Network className="w-8 h-8 text-accent/80" />
                        </div>
                      </div>
                      
                      <div className="space-y-4 mb-8">
                        <h2 className="text-2xl font-display font-medium text-white tracking-tight max-w-sm mx-auto leading-tight">
                          Generate the knowledge landscape
                        </h2>
                        <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
                          Analyze this frontier to reveal clusters, relationships, and emerging themes across the source documents.
                        </p>
                      </div>

                      <div className="flex flex-col items-center gap-8">
                        <button
                          onClick={handleAnalyzeFrontier}
                          disabled={isAnalyzing}
                          className="group relative px-10 py-3.5 bg-accent text-white font-semibold rounded-full transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="relative flex items-center gap-2.5">
                            <Zap className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                            <span className="text-sm">{isAnalyzing ? 'Analyzing Frontier...' : 'Analyze with Gemini'}</span>
                          </div>
                        </button>

                        <div className="pt-6 border-t border-white/[0.06] w-full max-w-[240px]">
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Table View shows raw sources</p>
                            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Graph View appears after analysis</p>
                            <p className="text-[10px] text-slate-500 font-medium tracking-wide">Illustrated World unlocks once graph structure exists</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div ref={graphStageRef} className="absolute inset-0 z-20 flex items-center justify-center">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={onNodeClick}
                  onInit={(instance) => { rfInstance.current = instance; }}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  className="w-full h-full"
                  fitView
                  fitViewOptions={{ padding: 0.08 }}
                  minZoom={0.45}
                  maxZoom={0.9}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  panOnDrag={false}
                  zoomOnScroll={false}
                  zoomOnPinch={false}
                  zoomOnDoubleClick={false}
                  elementsSelectable
                  proOptions={{ hideAttribution: true }}
                />
              </div>
            )}
          </div>

          {!isExporting && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
              <h2 className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">
                The Future Of
              </h2>
              <h1 className="text-3xl font-display font-bold text-white tracking-tight uppercase leading-none">
                {activeScenario?.name ?? 'Research Radar'}
              </h1>
            </div>
          )}

          {viewMode === 'graph' && hasClusters && !isExporting && (
            <div className="absolute bottom-24 right-8 z-30 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-4 py-3 text-xs text-slate-200 space-y-2">
              <div className="font-bold uppercase tracking-widest text-slate-400 text-[10px]">
                Relationship Legend
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 border-t-2 border-sky-400" />
                <span>Agreement / support</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 border-t-2 border-red-500" />
                <span>Disagreement / tradeoff</span>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className="w-8 border-t-2 border-slate-400"
                  style={{ borderTopStyle: 'dashed' }}
                />
                <span>Weak / emerging relationship</span>
              </div>
            </div>
          )}

          {!isExporting && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
            <div className="glass-panel px-2 py-1.5 flex items-center justify-center gap-2 shadow-2xl">
              <button
                onClick={() => setViewMode('table')}
                className={`min-w-[148px] justify-center px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                  viewMode === 'table' ? 'bg-accent text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Table View</span>
              </button>

              <button
                onClick={() => setViewMode('graph')}
                disabled={!canUseGraph}
                className={`min-w-[148px] justify-center px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-accent text-white'
                    : canUseGraph
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Graph View</span>
              </button>

              <div className="relative group/tooltip">
                <button
                  onClick={() => setViewMode('illustrated')}
                  disabled={!canUseIllustrated}
                  className={`min-w-[148px] justify-center px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                    viewMode === 'illustrated'
                      ? 'bg-accent text-white'
                      : canUseIllustrated
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 cursor-not-allowed opacity-50'
                  }`}
                >
                  {canUseIllustrated ? (
                    <Globe className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  <span>{isGeneratingImage ? 'Generating...' : 'Illustrated World'}</span>
                </button>

                {!canUseIllustrated && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-xl">
                    Run Analyze with Gemini to unlock Illustrated World.
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </main>

        <aside className="w-80 border-l border-white/5 flex flex-col bg-bg/50 backdrop-blur-sm">
          <AnimatePresence mode="wait">
            {selectedPaper ? (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-6 flex-1 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={() => {
                      setSelectedPaperId(null);
                    }}
                    className="text-slate-400 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Back to Cluster
                  </button>
                  <div className="relative">
                    <button
                      className="text-slate-400 cursor-pointer hover:text-white"
                      onClick={() => setShareMenuOpen((open) => !open)}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {shareMenuOpen && (
                      <div className="absolute right-0 top-8 z-50 w-60 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden py-1">
                        <button
                          className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                          onClick={handleCopyFrontierLink}
                        >
                          <Share2 className="w-4 h-4 text-slate-400" />
                          <span>Copy frontier link</span>
                        </button>

                        {hasClusters && (
                          <button
                            className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                            onClick={handleExportClustersImage}
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            <span>Export clusters image</span>
                          </button>
                        )}

                        {canUseIllustrated && researchImage && (
                          <button
                            className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                            onClick={handleExportIllustratedWorld}
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            <span>Export illustrated world</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
                      {selectedPaper.theme}
                    </span>
                    <h2 className="text-xl font-display font-bold text-white leading-tight">
                      {selectedPaper.title}
                    </h2>
                    <p className="text-xs text-slate-400">{selectedPaper.citation}</p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Abstract
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{selectedPaper.abstract}</p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <a
                    href={selectedPaper.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold text-sm transition-all"
                  >
                    <span>View Source</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            ) : selectedCluster ? (
              <motion.div
                key="cluster"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-6 flex-1 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={() => setSelectedClusterId(null)}
                    className="text-slate-400 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Back to Agent
                  </button>
                  <div className="relative">
                    <button
                      className="text-slate-400 cursor-pointer hover:text-white"
                      onClick={() => setShareMenuOpen((open) => !open)}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    {shareMenuOpen && (
                      <div className="absolute right-0 top-8 z-50 w-60 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden py-1">
                        <button
                          className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                          onClick={handleCopyFrontierLink}
                        >
                          <Share2 className="w-4 h-4 text-slate-400" />
                          <span>Copy frontier link</span>
                        </button>

                        {hasClusters && (
                          <button
                            className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                            onClick={handleExportClustersImage}
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            <span>Export clusters image</span>
                          </button>
                        )}

                        {canUseIllustrated && researchImage && (
                          <button
                            className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                            onClick={handleExportIllustratedWorld}
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            <span>Export illustrated world</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
                    Cluster
                  </span>
                  <h2 className="text-xl font-display font-bold text-white leading-tight">
                    {selectedCluster.theme}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {selectedCluster.paperCount} paper{selectedCluster.paperCount === 1 ? '' : 's'}
                  </p>
                </div>

                <div className="p-4 glass-panel bg-white/5 border-white/5 space-y-3 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Cluster Summary
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    This cluster groups related sources around <strong>{selectedCluster.theme}</strong>. Select a paper below to inspect the source in detail.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                  {selectedCluster.papers.map((paper) => (
                    <button
                      key={paper.id}
                      onClick={() => openPaperDetails(paper.id)}
                      className="w-full text-left p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all"
                    >
                      <div className="text-sm font-semibold text-white line-clamp-1">{paper.title}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {paper.theme}, {paper.year}
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : rightSidebarTab === 'notes' ? (
              <motion.div
                key="notes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-6 flex-1 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Database className="w-4 h-4 text-purple-400" />
                    </div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-widest">
                      Frontier Notes
                    </h2>
                  </div>
                  <button 
                    onClick={() => setRightSidebarTab('agent')}
                    className="text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-widest"
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Active Frontier
                    </span>
                    <h3 className="text-sm font-bold text-white">
                      {activeScenario?.name}
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                      Research Workspace
                    </label>
                    <textarea
                      className="w-full h-64 bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-accent/50 transition-all resize-none"
                      placeholder="Capture your thoughts, hypotheses, and research questions here..."
                      value={frontierNotes[activeScenario?.id || '']?.text || ''}
                      onChange={(e) => {
                        if (!activeScenario) return;
                        const val = e.target.value;
                        setFrontierNotes(prev => ({
                          ...prev,
                          [activeScenario.id]: {
                            ...(prev[activeScenario.id] || { attachments: [] }),
                            text: val
                          }
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Exported Assets ({frontierNotes[activeScenario?.id || '']?.attachments.length || 0})
                      </label>
                    </div>
                    
                    <div className="space-y-3">
                      {(frontierNotes[activeScenario?.id || '']?.attachments || []).map(att => (
                        <div key={att.id} className="p-3 rounded-xl bg-white/5 border border-white/10 group">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden border border-white/5">
                              {att.dataUrl ? (
                                <img src={att.dataUrl} alt="Thumbnail" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <FileText className="w-5 h-5 text-slate-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {att.type === 'cluster-image' ? 'Cluster Map' : 'Illustrated World'}
                              </div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-tighter">
                                {new Date(att.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            {att.dataUrl && (
                              <a 
                                href={att.dataUrl} 
                                download={att.filename}
                                className="p-2 text-slate-500 hover:text-accent transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {(!frontierNotes[activeScenario?.id || '']?.attachments || frontierNotes[activeScenario?.id || '']?.attachments.length === 0) && (
                        <div className="text-center py-8 border border-dashed border-white/5 rounded-xl">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest italic">
                            No exported assets yet
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="agent"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-6 flex-1 flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-accent" />
                    </div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-widest">
                      Frontier Agent
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">
                        Live
                      </span>
                    </div>

                    <div className="h-4 w-px bg-white/10 mx-1" />

                    <div className="relative">
                      <button
                        className="text-slate-400 cursor-pointer hover:text-white"
                        onClick={() => setShareMenuOpen((open) => !open)}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {shareMenuOpen && (
                        <div className="absolute right-0 top-8 z-50 w-60 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-md shadow-xl overflow-hidden py-1">
                          <button
                            className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                            onClick={handleCopyFrontierLink}
                          >
                            <Share2 className="w-4 h-4 text-slate-400" />
                            <span>Copy frontier link</span>
                          </button>

                          {hasClusters && (
                            <button
                              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                              onClick={handleExportClustersImage}
                            >
                              <Download className="w-4 h-4 text-slate-400" />
                              <span>Export clusters image</span>
                            </button>
                          )}

                          {canUseIllustrated && researchImage && (
                            <button
                              className="w-full px-4 py-3 text-left text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"
                              onClick={handleExportIllustratedWorld}
                            >
                              <Download className="w-4 h-4 text-slate-400" />
                              <span>Export illustrated world</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                  {analysisPhase === 'running' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-accent/5 border border-accent/10 text-[11px] text-accent space-y-3 mb-4"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="font-bold uppercase tracking-wider">Analyzing {activeScenario?.papers.length} sources...</span>
                      </div>
                      <div className="space-y-1.5 pl-3 border-l border-accent/20">
                        {[
                          'reading source metadata',
                          'detecting research themes',
                          'clustering related papers',
                          'mapping agreements and conflicts'
                        ].map((step, idx) => (
                          <div key={idx} className={`transition-all duration-300 ${reasoningStep > idx ? 'opacity-100 translate-x-0' : 'opacity-30 -translate-x-1'}`}>
                            {step}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  
                  {(() => {
                    const renderedChatMessages = [];
                    for (let i = chatMessages.length - 1; i >= 0; i--) {
                      const msg = chatMessages[i];
                      if (msg.role === 'assistant' && i > 0 && chatMessages[i - 1].role === 'user') {
                        renderedChatMessages.push(chatMessages[i - 1]);
                        renderedChatMessages.push(msg);
                        i--;
                      } else {
                        renderedChatMessages.push(msg);
                      }
                    }

                    return renderedChatMessages.map((msg, i) => (
                      <motion.div
                        key={msg.id || i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`group relative p-4 rounded-2xl text-sm ${
                          msg.role === 'assistant'
                            ? 'bg-white/5 text-slate-200'
                            : 'bg-accent/10 border border-accent/20 text-white ml-4'
                        }`}
                      >
                        {msg.role === 'user' && msg.exchangeId && msg.exchangeId !== 'initial' && (
                          <button
                            onClick={() => handleDeleteExchange(msg.exchangeId!)}
                            className="absolute top-2 right-2 p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity bg-bg/40 rounded-lg backdrop-blur-sm border border-white/5"
                            title="Delete exchange"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        ) : (
                          msg.text
                        )}
                      </motion.div>
                    ));
                  })()}

                  {chatMessages.length === 1 && (
                    <div className="grid grid-cols-1 gap-2 mt-6">
                      {[
                        'Where is the consensus?',
                        'What conflicts exist?',
                        'Most impactful strategies?',
                        'Gaps in research?',
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSuggestedQuestion(q)}
                          className="text-left p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all text-xs text-slate-300 hover:text-white"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Frontier Tools Section */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      Frontier Tools
                    </h3>
                    {analysisPhase === 'running' && (
                      <span className="text-[9px] text-accent animate-pulse font-bold uppercase tracking-tighter">
                        Scanning...
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      disabled={analysisPhase === 'idle' || analysisPhase === 'running' || !hasClusters}
                      onClick={handleKeyInsights}
                      className={`relative group flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-500 ${
                        analysisPhase === 'idle' 
                          ? 'bg-white/[0.02] border-white/5 opacity-40 grayscale cursor-not-allowed'
                          : analysisPhase === 'running'
                            ? 'bg-accent/5 border-accent/20 animate-pulse shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                            : 'bg-white/5 border-white/10 hover:border-accent/40 hover:bg-white/10 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Zap className={`w-4 h-4 ${analysisPhase === 'complete' ? 'text-accent' : 'text-slate-500'}`} />
                        {analysisPhase === 'complete' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                        )}
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${analysisPhase === 'complete' ? 'text-white' : 'text-slate-500'}`}>
                        Key Insights
                      </span>
                    </button>

                    <button
                      disabled={analysisPhase === 'idle' || analysisPhase === 'running' || !hasClusters}
                      onClick={handleResearchTimeline}
                      className={`relative group flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-500 ${
                        analysisPhase === 'idle' 
                          ? 'bg-white/[0.02] border-white/5 opacity-40 grayscale cursor-not-allowed'
                          : analysisPhase === 'running'
                            ? 'bg-accent/5 border-accent/20 animate-pulse shadow-[0_0_15px_rgba(56,189,248,0.1)]'
                            : 'bg-white/5 border-white/10 hover:border-accent/40 hover:bg-white/10 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Clock className={`w-4 h-4 ${analysisPhase === 'complete' ? 'text-accent' : 'text-slate-500'}`} />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${analysisPhase === 'complete' ? 'text-white' : 'text-slate-500'}`}>
                        Timeline
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>

      {showLinkInput && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: '90vw',
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', color: 'white' }}>Add Research Link</h3>

            <input
              type="text"
              placeholder="Paste research URL..."
              value={pendingLinkUrl}
              onChange={(e) => setPendingLinkUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.2)',
                background: '#111827',
                color: 'white',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                marginTop: 14,
              }}
            >
              <button
                onClick={() => {
                  setShowLinkInput(false);
                  setPendingLinkUrl('');
                  setTargetScenarioId(null);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: '#1f2937',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  const scenarioId = targetScenarioId ?? activeScenario?.id;
                  if (!scenarioId) return;

                  const urls = pendingLinkUrl.match(/https?:\/\/[^\s,]+/g) ?? [];

                  if (urls.length !== 1) {
                    alert('Please add one paper link at a time.');
                    return;
                  }

                  const url = urls[0];

                  setShowLinkInput(false);
                  setPendingLinkUrl('');
                  setTargetScenarioId(null);

                  void handleLinkAdd(url, scenarioId);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#2563eb',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEmpty && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
          }}
        >
          <div
            style={{
              width: 400,
              maxWidth: '90vw',
              background: '#0f172a',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', color: 'white', fontSize: '18px' }}>
              {confirmEmpty.type === 'papers' ? 'Empty Paper Recycle Bin?' : 'Empty Frontier Recycle Bin?'}
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>
              {confirmEmpty.type === 'papers' 
                ? 'This will permanently delete all trashed papers in this frontier. This action cannot be undone.' 
                : 'This will permanently delete all trashed frontiers. This action cannot be undone.'}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmEmpty(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: '#1f2937',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmEmpty.type === 'papers' && confirmEmpty.packId) {
                    executeEmptyPaperBin(confirmEmpty.packId);
                  } else if (confirmEmpty.type === 'frontiers') {
                    executeEmptyFrontierBin();
                  }
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {copied && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg border border-white/10">
          Frontier link copied
        </div>
      )}

    </div>
  );
}