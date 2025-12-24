import { useState } from 'react';
import {
    Dimensions,
    PanResponder,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_SIZE = 20;

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface DraggableNodeProps {
  node: Node;
  onMove: (id: string, x: number, y: number) => void;
}

function DraggableNode({ node, onMove }: DraggableNodeProps) {
  const translateX = useSharedValue(node.x);
  const translateY = useSharedValue(node.y);
  const scale = useSharedValue(1);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      scale.value = withSpring(1.05);
    },
    onPanResponderMove: (_, gestureState) => {
      translateX.value = node.x + gestureState.dx;
      translateY.value = node.y + gestureState.dy;
    },
    onPanResponderRelease: (_, gestureState) => {
      scale.value = withSpring(1);
      const newX = node.x + gestureState.dx;
      const newY = node.y + gestureState.dy;
      onMove(node.id, newX, newY);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[styles.node, animatedStyle]}
      {...panResponder.panHandlers}
    >
      {/* Connection points */}
      <View style={[styles.connectionPoint, styles.connectionTop]} />
      <View style={[styles.connectionPoint, styles.connectionBottom]} />
      <View style={[styles.connectionPoint, styles.connectionLeft]} />
      <View style={[styles.connectionPoint, styles.connectionRight]} />
      
      <Text style={styles.nodeText}>{node.label}</Text>
    </Animated.View>
  );
}

export default function FlowchartCanvas() {
  const insets = useSafeAreaInsets();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodeCounter, setNodeCounter] = useState(1);

  const addNode = () => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      x: SCREEN_WIDTH / 2 - 75,
      y: SCREEN_HEIGHT / 3,
      label: `Node ${nodeCounter}`,
    };
    setNodes([...nodes, newNode]);
    setNodeCounter(nodeCounter + 1);
  };

  const moveNode = (id: string, x: number, y: number) => {
    setNodes(
      nodes.map((node) => (node.id === id ? { ...node, x, y } : node))
    );
  };

  // Generate grid lines
  const renderGrid = () => {
    const horizontalLines = [];
    const verticalLines = [];

    for (let i = 0; i < SCREEN_HEIGHT / GRID_SIZE; i++) {
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

    for (let i = 0; i < SCREEN_WIDTH / GRID_SIZE; i++) {
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

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header with Safe Area */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Flowchart Creator</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton}>
            <Text style={styles.headerButtonText}>🔍+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Text style={styles.headerButtonText}>🔍-</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Text style={styles.headerButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Canvas with Grid */}
      <View style={styles.canvas}>
        {renderGrid()}
        
        {/* Nodes */}
        {nodes.map((node) => (
          <DraggableNode key={node.id} node={node} onMove={moveNode} />
        ))}
      </View>

      {/* Right Side Panel - 4 Buttons */}
      <View style={styles.rightPanel}>
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Dikdörtgen</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Karar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Başla</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Bitir</Text>
        </TouchableOpacity>
      </View>

      {/* Add Button (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={addNode}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 56,
    backgroundColor: '#4A9EE0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#E0E0E0',
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
  node: {
    position: 'absolute',
    width: 150,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A9EE0',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  nodeText: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '500',
  },
  connectionPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A9EE0',
  },
  connectionTop: {
    top: -6,
    left: '50%',
    marginLeft: -6,
  },
  connectionBottom: {
    bottom: -6,
    left: '50%',
    marginLeft: -6,
  },
  connectionLeft: {
    left: -6,
    top: '50%',
    marginTop: -6,
  },
  connectionRight: {
    right: -6,
    top: '50%',
    marginTop: -6,
  },
  rightPanel: {
    position: 'absolute',
    right: 16,
    top: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    gap: 8,
  },
  panelButton: {
    width: 80,
    height: 60,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  rectangleIcon: {
    width: 40,
    height: 24,
    borderWidth: 2,
    borderColor: '#4A9EE0',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  panelButtonText: {
    fontSize: 10,
    color: '#666666',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#4A9EE0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36,
  },
});
