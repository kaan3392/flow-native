import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Ellipse, Line, Polygon, Rect } from "react-native-svg";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GRID_SIZE = 20;
const CANVAS_SIZE = 3000; // Large canvas for panning
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const NODE_WIDTH = 150;

const NODE_HEIGHT = 50;
const FLOWCHART_STATE_KEY = "FLOWCHART_STATE_V1";

type NodeType =
  | "rectangle"
  | "diamond"
  | "oval"
  | "parallelogram"
  | "hexagon"
  | "storage";

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
  type: NodeType;
}

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePosition: "top" | "bottom" | "left" | "right";
  targetPosition: "top" | "bottom" | "left" | "right";
}

interface DraggableNodeProps {
  node: Node;
  onMove: (id: string, x: number, y: number) => void;
  onDragging: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string) => void;
  onConnectionPointTap: (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => void;
  onConnectionDragStart: (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => void;
  onConnectionDragMove: (dx: number, dy: number) => void;
  onConnectionDragEnd: (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => void;
  onConnectionDragCancel: () => void;
  onConnectionPointDoubleTap: (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => void;
  isConnecting: boolean;
  connectingNodeId: string | null;
  allNodes: Node[];
  canvasScale: number;
}

function DraggableNode({
  node,
  onMove,
  onDragging,
  onDragEnd,
  onConnectionPointTap,
  onConnectionDragStart,
  onConnectionDragMove,
  onConnectionDragEnd,
  onConnectionDragCancel,
  onConnectionPointDoubleTap,
  isConnecting,
  connectingNodeId,
  allNodes,
  canvasScale,
}: DraggableNodeProps) {
  const translateX = useSharedValue(node.x);
  const translateY = useSharedValue(node.y);
  const scale = useSharedValue(1);

  // Sync shared values with node props (needed for undo/redo)
  useEffect(() => {
    translateX.value = node.x;
    translateY.value = node.y;
  }, [node.x, node.y]);

  // Track double taps
  const lastTapRef = useRef<number | null>(null);

  // Use refs to store latest values without causing re-renders
  const isDraggingConnectionRef = useRef(false);
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;

  // Store node position in ref to access latest value in callbacks
  const nodeRef = useRef(node);
  nodeRef.current = node;

  // Store canvasScale in ref
  const canvasScaleRef = useRef(canvasScale);
  canvasScaleRef.current = canvasScale;

  // Store callbacks in refs to access latest versions
  const callbacksRef = useRef({
    onMove,
    onDragging,
    onDragEnd,
    onConnectionDragStart,
    onConnectionDragMove,
    onConnectionDragEnd,
    onConnectionDragCancel,
    onConnectionPointDoubleTap,
  });
  callbacksRef.current = {
    onMove,
    onDragging,
    onDragEnd,
    onConnectionDragStart,
    onConnectionDragMove,
    onConnectionDragEnd,
    onConnectionDragCancel,
    onConnectionPointDoubleTap,
  };

  // Memoize node drag PanResponder
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isDraggingConnectionRef.current,
        onMoveShouldSetPanResponder: () => !isDraggingConnectionRef.current,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          scale.value = withSpring(1.05);
        },
        onPanResponderMove: (_, gestureState) => {
          // Divide by scale to get correct canvas coordinates
          const scaledDx = gestureState.dx / canvasScaleRef.current;
          const scaledDy = gestureState.dy / canvasScaleRef.current;
          const newX = nodeRef.current.x + scaledDx;
          const newY = nodeRef.current.y + scaledDy;
          translateX.value = newX;
          translateY.value = newY;
          // Update edge positions in real-time
          callbacksRef.current.onDragging(nodeRef.current.id, newX, newY);
        },
        onPanResponderRelease: (_, gestureState) => {
          scale.value = withSpring(1);
          const scaledDx = gestureState.dx / canvasScaleRef.current;
          const scaledDy = gestureState.dy / canvasScaleRef.current;
          const newX = nodeRef.current.x + scaledDx;
          const newY = nodeRef.current.y + scaledDy;
          callbacksRef.current.onMove(nodeRef.current.id, newX, newY);
          callbacksRef.current.onDragEnd(nodeRef.current.id);
        },
      }),
    []
  );

  // Create memoized pan responder for connection point drag
  const createConnectionPanResponder = (
    position: "top" | "bottom" | "left" | "right"
  ) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const now = Date.now();
        if (lastTapRef.current && now - lastTapRef.current < 300) {
          // Double tap detected
          callbacksRef.current.onConnectionPointDoubleTap(
            nodeRef.current.id,
            position
          );
          lastTapRef.current = null; // Reset
          return;
        }
        lastTapRef.current = now;

        isDraggingConnectionRef.current = true;
        callbacksRef.current.onConnectionDragStart(
          nodeRef.current.id,
          position
        );
      },
      onPanResponderMove: (_, gestureState) => {
        // Divide by scale to get correct canvas coordinates
        const scaledDx = gestureState.dx / canvasScaleRef.current;
        const scaledDy = gestureState.dy / canvasScaleRef.current;
        callbacksRef.current.onConnectionDragMove(scaledDx, scaledDy);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingConnectionRef.current = false;

        const currentNode = nodeRef.current;
        const currentScale = canvasScaleRef.current;
        // Calculate drop position with scale compensation
        const scaledDx = gestureState.dx / currentScale;
        const scaledDy = gestureState.dy / currentScale;
        const startX =
          currentNode.x +
          (position === "left"
            ? 0
            : position === "right"
            ? NODE_WIDTH
            : NODE_WIDTH / 2);
        const startY =
          currentNode.y +
          (position === "top"
            ? 0
            : position === "bottom"
            ? NODE_HEIGHT
            : NODE_HEIGHT / 2);
        const dropX = startX + scaledDx;
        const dropY = startY + scaledDy;

        const currentNodes = allNodesRef.current;
        console.log(
          "Drop at:",
          dropX,
          dropY,
          "from node:",
          currentNode.id,
          "available nodes:",
          currentNodes.map((n) => ({ id: n.id, x: n.x, y: n.y }))
        );

        // Find if we're over any other node
        let foundTarget = false;
        for (const otherNode of currentNodes) {
          if (otherNode.id === currentNode.id) continue;

          // Check if dropped within the other node's bounds (more generous)
          const nodeLeft = otherNode.x - 20;
          const nodeRight = otherNode.x + NODE_WIDTH + 20;
          const nodeTop = otherNode.y - 20;
          const nodeBottom = otherNode.y + NODE_HEIGHT + 20;

          if (
            dropX >= nodeLeft &&
            dropX <= nodeRight &&
            dropY >= nodeTop &&
            dropY <= nodeBottom
          ) {
            // Determine which connection point is closest
            const positions: ("top" | "bottom" | "left" | "right")[] = [
              "top",
              "bottom",
            ];
            let closestPos: "top" | "bottom" | "left" | "right" = "top";
            let minDistance = Infinity;

            for (const pos of positions) {
              const point = {
                x:
                  otherNode.x +
                  (pos === "left"
                    ? 0
                    : pos === "right"
                    ? NODE_WIDTH
                    : NODE_WIDTH / 2),
                y:
                  otherNode.y +
                  (pos === "top"
                    ? 0
                    : pos === "bottom"
                    ? NODE_HEIGHT
                    : NODE_HEIGHT / 2),
              };
              const distance = Math.sqrt(
                Math.pow(dropX - point.x, 2) + Math.pow(dropY - point.y, 2)
              );
              if (distance < minDistance) {
                minDistance = distance;
                closestPos = pos;
              }
            }

            console.log(
              "Found target node:",
              otherNode.id,
              "position:",
              closestPos
            );
            callbacksRef.current.onConnectionDragEnd(otherNode.id, closestPos);
            foundTarget = true;
            break;
          }
        }

        if (!foundTarget) {
          console.log("No target found");
          callbacksRef.current.onConnectionDragCancel();
        }
      },
    });
  };

  // Memoize connection point PanResponders to prevent recreation
  const topPanResponder = useMemo(
    () => createConnectionPanResponder("top"),
    []
  );
  const bottomPanResponder = useMemo(
    () => createConnectionPanResponder("bottom"),
    []
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const isSourceNode = connectingNodeId === node.id;

  // Get node shape styles based on type
  const getNodeShapeStyle = () => {
    switch (node.type) {
      case "diamond":
        return {
          width: 80,
          height: 80,
          transform: [{ rotate: "45deg" }],
          borderRadius: 0, // Sharp corners
        };
      case "oval":
        return {
          // True ellipse - use 50% of height for full rounding
          borderRadius: "50%", // Large value creates true ellipse
        };
      case "parallelogram":
        return {
          transform: [{ skewX: "-15deg" }],
        };
      case "hexagon":
        // Use skew transforms on both sides to create hexagon effect
        return {
          borderRadius: 4,
        };
      case "storage":
        return {
          borderTopLeftRadius: 75,
          borderTopRightRadius: 75,
          borderBottomLeftRadius: 4,
          borderBottomRightRadius: 4,
        };
      case "rectangle":
      default:
        return {};
    }
  };

  // Get text container style for rotated shapes
  const getTextContainerStyle = () => {
    switch (node.type) {
      case "diamond":
        return {
          transform: [{ rotate: "-45deg" }],
          width: 110,
          height: 60,
        };
      case "parallelogram":
        return {
          transform: [{ skewX: "15deg" }],
        };
      default:
        return {};
    }
  };

  // Get node container size based on type
  const getNodeContainerStyle = () => {
    switch (node.type) {
      case "diamond":
        return {
          width: 80,
          height: 80,
        };
      case "oval":
        return {
          width: 120,
          height: 60,
        };
      case "hexagon":
        return {
          width: 140,
          height: 70,
        };
      case "storage":
        return {
          width: 100,
          height: 85,
        };
      default:
        return {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        };
    }
  };

  // Render the node shape based on type
  const renderNodeShape = () => {
    // Storage - cylinder/database shape using SVG
    if (node.type === "storage") {
      const width = 100;
      const height = 85;
      const ellipseRx = width / 2 - 2;
      const ellipseRy = 12;
      const bodyTop = ellipseRy;
      const bodyBottom = height - ellipseRy;

      return (
        <View style={styles.hexagonWrapper} {...panResponder.panHandlers}>
          <Svg width={width} height={height} style={{ position: "absolute" }}>
            {/* White fill for body */}
            <Rect
              x={2}
              y={bodyTop}
              width={width - 4}
              height={bodyBottom - bodyTop}
              fill="#FFFFFF"
            />
            {/* Bottom ellipse fill */}
            <Ellipse
              cx={width / 2}
              cy={bodyBottom}
              rx={ellipseRx}
              ry={ellipseRy}
              fill="#FFFFFF"
            />
            {/* Top ellipse fill */}
            <Ellipse
              cx={width / 2}
              cy={bodyTop}
              rx={ellipseRx}
              ry={ellipseRy}
              fill="#FFFFFF"
            />
            {/* Left side line */}
            <Line
              x1={2}
              y1={bodyTop}
              x2={2}
              y2={bodyBottom}
              stroke="#4A9EE0"
              strokeWidth="2"
            />
            {/* Right side line */}
            <Line
              x1={width - 2}
              y1={bodyTop}
              x2={width - 2}
              y2={bodyBottom}
              stroke="#4A9EE0"
              strokeWidth="2"
            />
            {/* Bottom ellipse border */}
            <Ellipse
              cx={width / 2}
              cy={bodyBottom}
              rx={ellipseRx}
              ry={ellipseRy}
              fill="none"
              stroke="#4A9EE0"
              strokeWidth="2"
            />
            {/* Top ellipse border */}
            <Ellipse
              cx={width / 2}
              cy={bodyTop}
              rx={ellipseRx}
              ry={ellipseRy}
              fill="#FFFFFF"
              stroke="#4A9EE0"
              strokeWidth="2"
            />
          </Svg>
          <Text style={[styles.nodeText, { marginTop: 10 }]} numberOfLines={2}>
            {node.label}
          </Text>
        </View>
      );
    }

    // Hexagon - using SVG Polygon for proper 6-sided shape
    if (node.type === "hexagon") {
      const width = 140;
      const height = 80;
      // clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
      const points = `${width * 0.25},2 ${width * 0.75},2 ${width - 2},${
        height / 2
      } ${width * 0.75},${height - 2} ${width * 0.25},${height - 2} 2,${
        height / 2
      }`;
      const fillPoints = `${width * 0.25},0 ${width * 0.75},0 ${width},${
        height / 2
      } ${width * 0.75},${height} ${width * 0.25},${height} 0,${height / 2}`;

      return (
        <View style={styles.hexagonWrapper} {...panResponder.panHandlers}>
          <Svg width={width} height={height} style={{ position: "absolute" }}>
            <Polygon points={fillPoints} fill="#FFFFFF" />
            <Polygon
              points={points}
              fill="none"
              stroke="#4A9EE0"
              strokeWidth="2"
            />
          </Svg>
          <Text style={styles.nodeText} numberOfLines={2}>
            {node.label}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[styles.node, getNodeShapeStyle()]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.nodeDragArea, getTextContainerStyle()]}>
          <Text style={styles.nodeText} numberOfLines={2}>
            {node.label}
          </Text>
        </View>
      </View>
    );
  };

  const getConnectionTopStyle = () => {
    if (node.type === "diamond") {
      return { top: -20, left: 30, marginLeft: 0 };
    }
    if (node.type === "hexagon") {
      return { top: -12 };
    }
    return {};
  };

  const getConnectionBottomStyle = () => {
    if (node.type === "diamond") {
      return { bottom: -20, left: 30, marginLeft: 0 };
    }
    if (node.type === "hexagon") {
      return { bottom: -12 };
    }
    if (node.type === "storage") {
      return { bottom: 0 }; // Align with bottom ellipse
    }
    return {};
  };

  return (
    <Animated.View
      style={[styles.nodeContainer, animatedStyle, getNodeContainerStyle()]}
    >
      {renderNodeShape()}

      <View
        style={[
          styles.connectionPoint,
          styles.connectionTop,
          getConnectionTopStyle(),
          isConnecting && !isSourceNode && styles.connectionPointActive,
        ]}
        {...topPanResponder.panHandlers}
      />
      <View
        style={[
          styles.connectionPoint,
          styles.connectionBottom,
          getConnectionBottomStyle(),
          isConnecting && !isSourceNode && styles.connectionPointActive,
        ]}
        {...bottomPanResponder.panHandlers}
      />
    </Animated.View>
  );
}
export default function FlowchartCanvas() {
  const insets = useSafeAreaInsets();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [nodeCounter, setNodeCounter] = useState(1);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    position: "top" | "bottom" | "left" | "right";
  } | null>(null);
  const [dragLine, setDragLine] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  // Track node position during drag for real-time edge updates
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  // Track current scale for gesture compensation
  const [currentScale, setCurrentScale] = useState(1);

  // Undo/Redo history
  type HistoryState = { nodes: Node[]; edges: Edge[]; nodeCounter: number };
  const [history, setHistory] = useState<HistoryState[]>([
    { nodes: [], edges: [], nodeCounter: 1 },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Save state to history (call after each action)
  const saveToHistory = (
    newNodes: Node[],
    newEdges: Edge[],
    newCounter: number
  ) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      nodes: newNodes,
      edges: newEdges,
      nodeCounter: newCounter,
    });
    // Limit history to 50 items
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo action
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      setNodes(state.nodes);
      setEdges(state.edges);
      setNodeCounter(state.nodeCounter);
      setHistoryIndex(newIndex);
    }
  };

  // Redo action
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      setNodes(state.nodes);
      setEdges(state.edges);
      setNodeCounter(state.nodeCounter);
      setHistoryIndex(newIndex);
    }
  };

  const canUndo = historyIndex > 0;

  const canRedo = historyIndex < history.length - 1;

  // Load state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedState = await AsyncStorage.getItem(FLOWCHART_STATE_KEY);
        if (savedState) {
          const parsedState = JSON.parse(savedState);
          setNodes(parsedState.nodes || []);
          setEdges(parsedState.edges || []);
          setNodeCounter(parsedState.nodeCounter || 1);
          // Initialize history with loaded state
          setHistory([
            {
              nodes: parsedState.nodes || [],
              edges: parsedState.edges || [],
              nodeCounter: parsedState.nodeCounter || 1,
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to load state", error);
      }
    };
    loadState();
  }, []);

  // Save state whenever relevant data changes
  useEffect(() => {
    const saveState = async () => {
      try {
        const stateToSave = JSON.stringify({
          nodes,
          edges,
          nodeCounter,
        });
        await AsyncStorage.setItem(FLOWCHART_STATE_KEY, stateToSave);
      } catch (error) {
        console.error("Failed to save state", error);
      }
    };

    // Debounce save slightly to avoid excessive writes
    const timeoutId = setTimeout(saveState, 500);
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, nodeCounter]);

  // Canvas transform values - start centered
  const initialX = -(CANVAS_SIZE / 2 - SCREEN_WIDTH / 2);
  const initialY = -(CANVAS_SIZE / 2 - SCREEN_HEIGHT / 2);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  const savedTranslateX = useSharedValue(initialX);
  const savedTranslateY = useSharedValue(initialY);

  // Get node dimensions based on type
  const getNodeDimensions = (node: Node) => {
    switch (node.type) {
      case "diamond":
        return { width: 80, height: 80 };
      case "oval":
        return { width: 130, height: 70 };
      case "hexagon":
        return { width: 140, height: 80 };
      case "storage":
        return { width: 100, height: 85 };
      default:
        return { width: NODE_WIDTH, height: NODE_HEIGHT };
    }
  };

  // Get connection point coordinates for a node, with optional override for dragging position
  const getConnectionPoint = (
    node: Node,
    position: "top" | "bottom" | "left" | "right",
    overridePos?: { x: number; y: number }
  ) => {
    const nodeX = overridePos?.x ?? node.x;
    const nodeY = overridePos?.y ?? node.y;
    const { width, height } = getNodeDimensions(node);
    const centerX = nodeX + width / 2;
    const centerY = nodeY + height / 2;

    // For oval, move left/right points inward to match the ellipse shape
    const horizontalInset = node.type === "oval" ? 15 : 0;

    switch (position) {
      case "top":
        return { x: centerX, y: nodeY };
      case "bottom":
        return { x: centerX, y: nodeY + height };
      case "left":
        return { x: nodeX + horizontalInset, y: centerY };
      case "right":
        return { x: nodeX + width - horizontalInset, y: centerY };
    }
  };

  // Start connection drag from a connection point
  const handleConnectionDragStart = (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const point = getConnectionPoint(node, position);
    setConnectingFrom({ nodeId, position });
    setDragLine({
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    });
  };

  // Update drag line position
  const handleConnectionDragMove = (dx: number, dy: number) => {
    if (dragLine) {
      setDragLine({
        ...dragLine,
        endX: dragLine.startX + dx,
        endY: dragLine.startY + dy,
      });
    }
  };

  // End connection drag - check if dropped on a connection point
  const handleConnectionDragEnd = (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => {
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        sourceId: connectingFrom.nodeId,
        targetId: nodeId,
        sourcePosition: connectingFrom.position,
        targetPosition: position,
      };
      const newEdges = [...edges, newEdge];
      setEdges(newEdges);
      saveToHistory(nodes, newEdges, nodeCounter);
    }
    setConnectingFrom(null);
    setDragLine(null);
  };

  // Cancel connection drag
  const cancelConnectionDrag = () => {
    setConnectingFrom(null);
    setDragLine(null);
  };

  // Handle connection point tap (for tap-to-connect mode)
  const handleConnectionPointTap = (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => {
    if (connectingFrom === null) {
      // Start connection
      setConnectingFrom({ nodeId, position });
    } else {
      // Complete connection
      if (connectingFrom.nodeId !== nodeId) {
        const newEdge: Edge = {
          id: `edge-${Date.now()}`,
          sourceId: connectingFrom.nodeId,
          targetId: nodeId,
          sourcePosition: connectingFrom.position,
          targetPosition: position,
        };
        const newEdges = [...edges, newEdge];
        setEdges(newEdges);
        saveToHistory(nodes, newEdges, nodeCounter);
      }
      setConnectingFrom(null);
    }
  };

  // Modal state for node type selection

  // Node type options
  const nodeTypes: { type: NodeType; label: string; icon: string }[] = [
    { type: "diamond", label: "Diamond", icon: "◇" },
    { type: "rectangle", label: "Rectangle", icon: "▬" },
    { type: "oval", label: "Oval", icon: "●" },
    { type: "parallelogram", label: "Parallelogram", icon: "▱" },
    { type: "hexagon", label: "Hexagon", icon: "⬡" },
    { type: "storage", label: "Storage", icon: "≡" },
  ];

  const addNode = (type: NodeType) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      x: CANVAS_SIZE / 2 - 75,
      y: CANVAS_SIZE / 2 - 25,
      label: `Node ${nodeCounter}`,
      type,
    };
    const newNodes = [...nodes, newNode];
    const newCounter = nodeCounter + 1;
    setNodes(newNodes);
    setNodeCounter(newCounter);
    saveToHistory(newNodes, edges, newCounter);
    setShowNodeModal(false);
  };

  // Handle double tap on connection point to add new node
  const handleConnectionPointDoubleTap = (
    nodeId: string,
    position: "top" | "bottom" | "left" | "right"
  ) => {
    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;

    const { height } = getNodeDimensions(sourceNode);
    const gap = 100; // Distance between nodes

    // Calculate new node position
    let newX = sourceNode.x;
    let newY = sourceNode.y;

    if (position === "top") {
      newY = sourceNode.y - NODE_HEIGHT - gap;
    } else if (position === "bottom") {
      newY = sourceNode.y + height + gap;
    } else {
      // Should not happen as we restricted to top/bottom, but for safety
      return;
    }

    const newNodeId = `${nodeCounter}`;
    const newNode: Node = {
      id: newNodeId,
      x: newX,
      y: newY,
      label: `Node ${nodeCounter}`,
      type: "rectangle",
    };

    const newEdge: Edge = {
      id: `e${sourceNode.id}-${newNodeId}`,
      sourceId: sourceNode.id,
      targetId: newNodeId,
      sourcePosition: position,
      targetPosition: position === "top" ? "bottom" : "top",
    };

    const newNodes = [...nodes, newNode];
    const newEdges = [...edges, newEdge];
    const newCounter = nodeCounter + 1;

    setNodes(newNodes);
    setEdges(newEdges);
    setNodeCounter(newCounter);
    saveToHistory(newNodes, newEdges, newCounter);
  };

  const moveNode = (id: string, x: number, y: number) => {
    const newNodes = nodes.map((node) =>
      node.id === id ? { ...node, x, y } : node
    );
    setNodes(newNodes);
    saveToHistory(newNodes, edges, nodeCounter);
  };

  // Handle node dragging for real-time edge updates
  const handleNodeDragging = (id: string, x: number, y: number) => {
    setDraggingNode({ id, x, y });
  };

  // Handle node drag end - clear dragging state
  const handleNodeDragEnd = (id: string) => {
    setDraggingNode(null);
  };

  // Canvas pan responder
  const canvasPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = savedTranslateX.value + gestureState.dx;
      translateY.value = savedTranslateY.value + gestureState.dy;
    },
    onPanResponderRelease: () => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
  });

  // Animated style for canvas transform
  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Generate grid lines for large canvas
  const renderGrid = () => {
    const horizontalLines = [];
    const verticalLines = [];

    for (let i = 0; i < CANVAS_SIZE / GRID_SIZE; i++) {
      horizontalLines.push(
        <View
          key={`h-${i}`}
          style={[
            styles.gridLine,
            styles.horizontalLine,
            { top: i * GRID_SIZE },
          ]}
        />
      );
    }

    for (let i = 0; i < CANVAS_SIZE / GRID_SIZE; i++) {
      verticalLines.push(
        <View
          key={`v-${i}`}
          style={[
            styles.gridLine,
            styles.verticalLine,
            { left: i * GRID_SIZE },
          ]}
        />
      );
    }

    return [...horizontalLines, ...verticalLines];
  };

  // Zoom controls
  const zoomIn = () => {
    const newScale = Math.min(scale.value * 1.2, MAX_SCALE);
    scale.value = withSpring(newScale);
    savedScale.value = newScale;
    setCurrentScale(newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(scale.value / 1.2, MIN_SCALE);
    scale.value = withSpring(newScale);
    savedScale.value = newScale;
    setCurrentScale(newScale);
  };

  const resetView = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    setCurrentScale(1);
    translateX.value = withSpring(initialX);
    translateY.value = withSpring(initialY);
    savedTranslateX.value = initialX;
    savedTranslateY.value = initialY;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header with Safe Area */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Flowchart Creator</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={zoomIn}>
            <Text style={styles.headerButtonText}>🔍+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={zoomOut}>
            <Text style={styles.headerButtonText}>🔍-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowOptionsMenu(true)}
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={24}
              color="white"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Zoomable/Pannable Canvas */}
      <View style={styles.canvasContainer}>
        <Animated.View
          style={[styles.canvas, canvasAnimatedStyle]}
          {...canvasPanResponder.panHandlers}
        >
          {/* Bezier curve edges */}
          {edges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.sourceId);
            const targetNode = nodes.find((n) => n.id === edge.targetId);
            if (!sourceNode || !targetNode) return null;

            // Use dragging position if this node is being dragged
            const sourceOverride =
              draggingNode?.id === sourceNode.id
                ? { x: draggingNode.x, y: draggingNode.y }
                : undefined;
            const targetOverride =
              draggingNode?.id === targetNode.id
                ? { x: draggingNode.x, y: draggingNode.y }
                : undefined;

            const start = getConnectionPoint(
              sourceNode,
              edge.sourcePosition,
              sourceOverride
            );
            const end = getConnectionPoint(
              targetNode,
              edge.targetPosition,
              targetOverride
            );

            // Calculate control points for smooth bezier curve
            const distance = Math.sqrt(
              Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
            );
            const curveOffset = Math.min(distance * 0.5, 80); // Curve intensity

            // Control points based on connection positions
            let cp1 = { x: start.x, y: start.y };
            let cp2 = { x: end.x, y: end.y };

            // Adjust control points based on source position
            switch (edge.sourcePosition) {
              case "top":
                cp1 = { x: start.x, y: start.y - curveOffset };
                break;
              case "bottom":
                cp1 = { x: start.x, y: start.y + curveOffset };
                break;
              case "left":
                cp1 = { x: start.x - curveOffset, y: start.y };
                break;
              case "right":
                cp1 = { x: start.x + curveOffset, y: start.y };
                break;
            }

            // Adjust control points based on target position
            switch (edge.targetPosition) {
              case "top":
                cp2 = { x: end.x, y: end.y - curveOffset };
                break;
              case "bottom":
                cp2 = { x: end.x, y: end.y + curveOffset };
                break;
              case "left":
                cp2 = { x: end.x - curveOffset, y: end.y };
                break;
              case "right":
                cp2 = { x: end.x + curveOffset, y: end.y };
                break;
            }

            // Generate bezier curve points
            const segments = 20;
            const curveSegments = [];

            for (let i = 0; i < segments; i++) {
              const t1 = i / segments;
              const t2 = (i + 1) / segments;

              // Cubic bezier formula
              const getPoint = (t: number) => {
                const mt = 1 - t;
                return {
                  x:
                    mt * mt * mt * start.x +
                    3 * mt * mt * t * cp1.x +
                    3 * mt * t * t * cp2.x +
                    t * t * t * end.x,
                  y:
                    mt * mt * mt * start.y +
                    3 * mt * mt * t * cp1.y +
                    3 * mt * t * t * cp2.y +
                    t * t * t * end.y,
                };
              };

              const p1 = getPoint(t1);
              const p2 = getPoint(t2);

              const segDx = p2.x - p1.x;
              const segDy = p2.y - p1.y;
              const segLength = Math.sqrt(segDx * segDx + segDy * segDy);
              const segAngle = Math.atan2(segDy, segDx) * (180 / Math.PI);

              curveSegments.push(
                <View
                  key={`${edge.id}-seg-${i}`}
                  style={{
                    position: "absolute",
                    left: p1.x,
                    top: p1.y - 1,
                    width: segLength + 1, // +1 to prevent gaps
                    height: 2,
                    backgroundColor: "#4A9EE0",
                    transformOrigin: "left center",
                    transform: [{ rotate: `${segAngle}deg` }],
                  }}
                />
              );
            }

            return (
              <React.Fragment key={edge.id}>{curveSegments}</React.Fragment>
            );
          })}

          {/* Drag line - shows while dragging from connection point */}
          {dragLine && (
            <View
              style={{
                position: "absolute",
                left: dragLine.startX,
                top: dragLine.startY - 1,
                width: Math.sqrt(
                  Math.pow(dragLine.endX - dragLine.startX, 2) +
                    Math.pow(dragLine.endY - dragLine.startY, 2)
                ),
                height: 2,
                backgroundColor: "#FF6B6B",
                transformOrigin: "left center",
                transform: [
                  {
                    rotate: `${
                      Math.atan2(
                        dragLine.endY - dragLine.startY,
                        dragLine.endX - dragLine.startX
                      ) *
                      (180 / Math.PI)
                    }deg`,
                  },
                ],
              }}
            />
          )}

          {renderGrid()}

          {/* Nodes */}
          {nodes.map((node) => (
            <DraggableNode
              key={node.id}
              node={node}
              onMove={moveNode}
              onDragging={handleNodeDragging}
              onDragEnd={handleNodeDragEnd}
              onConnectionPointTap={handleConnectionPointTap}
              onConnectionDragStart={handleConnectionDragStart}
              onConnectionDragMove={handleConnectionDragMove}
              onConnectionDragEnd={handleConnectionDragEnd}
              onConnectionDragCancel={cancelConnectionDrag}
              onConnectionPointDoubleTap={handleConnectionPointDoubleTap}
              isConnecting={connectingFrom !== null}
              connectingNodeId={connectingFrom?.nodeId || null}
              allNodes={nodes}
              canvasScale={currentScale}
            />
          ))}
        </Animated.View>
      </View>

      {/* Undo/Redo Controls */}
      <View style={styles.undoRedoContainer}>
        <TouchableOpacity
          style={[
            styles.undoRedoButton,
            !canUndo && styles.undoRedoButtonDisabled,
          ]}
          onPress={handleUndo}
          disabled={!canUndo}
        >
          <Text
            style={[
              styles.undoRedoText,
              !canUndo && styles.undoRedoTextDisabled,
            ]}
          >
            ↶
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.undoRedoButton,
            !canRedo && styles.undoRedoButtonDisabled,
          ]}
          onPress={handleRedo}
          disabled={!canRedo}
        >
          <Text
            style={[
              styles.undoRedoText,
              !canRedo && styles.undoRedoTextDisabled,
            ]}
          >
            ↷
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add Button (FAB) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNodeModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Node Type Selection Modal */}
      <Modal
        visible={showNodeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNodeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowNodeModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Element</Text>

            {nodeTypes.map((nodeType) => (
              <TouchableOpacity
                key={nodeType.type}
                style={styles.modalOption}
                onPress={() => addNode(nodeType.type)}
              >
                <Text style={styles.modalOptionIcon}>{nodeType.icon}</Text>
                <Text style={styles.modalOptionText}>{nodeType.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.modalBackButton}
              onPress={() => setShowNodeModal(false)}
            >
              <Text style={styles.modalBackText}>Back</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsMenuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                resetView();
                setShowOptionsMenu(false);
              }}
            >
              <MaterialCommunityIcons
                name="arrow-expand-all"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Reset Zoom</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="grid"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Grid Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="pencil"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Change Defaults</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="image"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Export Image</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="download"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Export FCD</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="upload"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Import FCD</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="refresh"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Default Chart</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setNodes([]);
                setEdges([]);
                setNodeCounter(1);
                setShowOptionsMenu(false);
              }}
            >
              <MaterialCommunityIcons
                name="delete"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Clear Chart</Text>
            </TouchableOpacity>

            <View style={styles.menuSeparator} />

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="youtube"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>YouTube Channel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="instagram"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Instagram Page</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="star-circle"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Upgrade to Pro</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="store"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>More Apps</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}>
              <MaterialCommunityIcons
                name="star"
                size={24}
                color="#555"
                style={styles.menuIcon}
              />
              <Text style={styles.menuText}>Rate App</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 56,
    paddingBottom: 12,
    backgroundColor: "#4A9EE0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    backgroundColor: "#FAFAFA",
    position: "relative",
  },
  canvasContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  gridLine: {
    position: "absolute",
    backgroundColor: "#E0E0E0",
  },
  horizontalLine: {
    left: 0,
    right: 0,
    height: 1,
  },
  verticalLine: {
    top: 0,
    bottom: 0,
    width: 1,
  },
  nodeContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  node: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#4A9EE0",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    overflow: "hidden",
  },
  nodeText: {
    color: "#333333",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  nodeDragArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  hexagonContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  // Oval - lens/eye shape styles
  ovalWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: "100%",
  },
  ovalLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 35,
    borderBottomWidth: 35,
    borderRightWidth: 25,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#FFFFFF",
  },
  ovalCenter: {
    flex: 1,
    height: 70,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: "#4A9EE0",
    borderBottomColor: "#4A9EE0",
    justifyContent: "center",
    alignItems: "center",
  },
  ovalRight: {
    width: 0,
    height: 0,
    borderTopWidth: 35,
    borderBottomWidth: 35,
    borderLeftWidth: 25,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
  },
  // Hexagon - 6-sided polygon styles
  hexagonWrapper: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  hexagonTopRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  hexagonTopLeft: {
    width: 0,
    height: 0,
    borderBottomWidth: 20,
    borderLeftWidth: 25,
    borderBottomColor: "#4A9EE0",
    borderLeftColor: "transparent",
  },
  hexagonTopCenter: {
    width: 70,
    height: 0,
    borderBottomWidth: 2,
    borderBottomColor: "#4A9EE0",
  },
  hexagonTopRight: {
    width: 0,
    height: 0,
    borderBottomWidth: 20,
    borderRightWidth: 25,
    borderBottomColor: "#4A9EE0",
    borderRightColor: "transparent",
  },
  hexagonMiddleRow: {
    width: 120,
    height: 40,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderLeftColor: "#4A9EE0",
    borderRightColor: "#4A9EE0",
    justifyContent: "center",
    alignItems: "center",
  },
  hexagonBottomRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hexagonBottomLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 20,
    borderLeftWidth: 25,
    borderTopColor: "#4A9EE0",
    borderLeftColor: "transparent",
  },
  hexagonBottomCenter: {
    width: 70,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: "#4A9EE0",
  },
  hexagonBottomRight: {
    width: 0,
    height: 0,
    borderTopWidth: 20,
    borderRightWidth: 25,
    borderTopColor: "#4A9EE0",
    borderRightColor: "transparent",
  },
  hexagonLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 25,
    borderBottomWidth: 25,
    borderRightWidth: 20,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#FFFFFF",
    marginRight: -2,
  },
  hexagonCenter: {
    flex: 1,
    height: 50,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderTopColor: "#4A9EE0",
    borderBottomColor: "#4A9EE0",
    justifyContent: "center",
    alignItems: "center",
  },
  hexagonRight: {
    width: 0,
    height: 0,
    borderTopWidth: 25,
    borderBottomWidth: 25,
    borderLeftWidth: 20,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
    marginLeft: -2,
  },
  hexagonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
  },
  hexagonTop: {
    width: 0,
    height: 0,
    borderLeftWidth: 70,
    borderRightWidth: 70,
    borderBottomWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#4A9EE0",
  },
  hexagonMiddle: {
    width: 140,
    height: 40,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderLeftColor: "#4A9EE0",
    borderRightColor: "#4A9EE0",
    justifyContent: "center",
    alignItems: "center",
  },
  hexagonBottom: {
    width: 0,
    height: 0,
    borderLeftWidth: 70,
    borderRightWidth: 70,
    borderTopWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#4A9EE0",
  },
  connectionPoint: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#4A9EE0",
  },
  connectionPointActive: {
    backgroundColor: "#4A9EE0",
    borderColor: "#2E7BB8",
    transform: [{ scale: 1.2 }],
  },
  connectionTop: {
    top: -10,
    left: "50%",
    marginLeft: -10,
  },
  connectionBottom: {
    bottom: -10,
    left: "50%",
    marginLeft: -10,
  },
  connectionLeft: {
    left: -10,
    top: "50%",
    marginTop: -10,
  },
  connectionRight: {
    right: -10,
    top: "50%",
    marginTop: -10,
  },

  fab: {
    position: "absolute",
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#4A9EE0",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "300",
    lineHeight: 36,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    maxWidth: 320,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalOptionIcon: {
    fontSize: 24,
    color: "#4A9EE0",
    width: 40,
    textAlign: "center",
  },
  modalOptionText: {
    fontSize: 16,
    color: "#333333",
    marginLeft: 12,
  },
  modalBackButton: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  modalBackText: {
    fontSize: 16,
    color: "#4A9EE0",
    fontWeight: "500",
  },
  undoRedoContainer: {
    position: "absolute",
    left: 24,
    bottom: 24,
    flexDirection: "row",
    gap: 16,
  },
  undoRedoButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  undoRedoButtonDisabled: {
    backgroundColor: "#F5F5F5",
    elevation: 0,
    shadowOpacity: 0,
    borderColor: "#EEEEEE",
  },
  undoRedoText: {
    fontSize: 28,
    color: "#4A9EE0",
    fontWeight: "bold",
  },
  undoRedoTextDisabled: {
    color: "#CCCCCC",
  },
  optionsMenuContainer: {
    position: "absolute",
    top: 50,
    right: 10,
    backgroundColor: "white",
    borderRadius: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    paddingVertical: 10,
    width: 250,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuIcon: {
    marginRight: 15,
  },
  menuText: {
    fontSize: 16,
    color: "#333",
  },
  menuSeparator: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 5,
  },
});
