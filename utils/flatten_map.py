"""
Map Flattening Tool for Minecraft-style Worlds
--------------------------------------------

This script processes a map.json file to create a flat terrain at a specified height.
It preserves underground structures and water bodies while ensuring a consistent surface level.

Key Features:
- Flattens the terrain to a specified height (default: y=0)
- Creates a continuous grass surface with no gaps
- Preserves all blocks below the target height
- Keeps water blocks only at or below the surface
- Adds a center marker (stone bricks) for easy navigation
- Automatically loads block types from the map data
- Saves the modified map to both working and assets directories

Usage:
1. Place this script in the same directory as your map.json
2. Run the script: python flatten_map.py
3. The script will:
   - Display all available block types
   - Show map boundaries and center coordinates
   - Create a flat surface
   - Save the modified map

The script preserves the original map structure while ensuring:
- No floating blocks above the surface
- No gaps in the terrain
- Water bodies remain only at or below surface level
- Underground structures stay intact
"""

from typing import Dict, List, Tuple, TypedDict
import json
from dataclasses import dataclass
import os
from pathlib import Path

# File paths
WORKSPACE_ROOT = Path(os.getcwd())
ASSETS_DIR = WORKSPACE_ROOT / 'assets'
# Path to the source map file that will be flattened
SOURCE_MAP_PATH = WORKSPACE_ROOT / 'map.json' 
SAVE_MAP_PATH = ASSETS_DIR / 'map.json'

# Map configuration
TARGET_HEIGHT = 0  # Height for the flat surface
CENTER_MARKER_HEIGHT = 2  # How many blocks high the center marker should be

class BlockData(TypedDict):
    id: int
    name: str
    textureUri: str
    isLiquid: bool

class MapData(TypedDict):
    blockTypes: List[BlockData]
    blocks: Dict[str, int]

class BlockTypes:
    """Dynamic container for block type IDs loaded from map data."""
    def __init__(self, block_types: List[BlockData]):
        # Create attributes dynamically based on block names
        for block in block_types:
            # Convert name to uppercase and replace hyphens with underscores
            attr_name = block['name'].upper().replace('-', '_')
            setattr(self, attr_name, block['id'])
        self._blocks = {block['id']: block for block in block_types}
    
    def get_block_name(self, block_id: int) -> str:
        """Get the name of a block by its ID."""
        return self._blocks[block_id]['name']
    
    def print_block_types(self) -> None:
        """Print all available block types and their IDs."""
        print("\nAvailable Block Types:")
        print("-" * 40)
        for block_id, block in sorted(self._blocks.items()):
            print(f"ID: {block_id:2d} | Name: {block['name']}")
            print(f"     Texture: {block['textureUri']}")
            if block.get('isLiquid'):
                print("     Type: Liquid")
            print("-" * 40)

@dataclass
class Coordinates:
    x: int
    y: int
    z: int
    
    @classmethod
    def from_string(cls, coord_str: str) -> 'Coordinates':
        x, y, z = map(int, coord_str.split(','))
        return cls(x, y, z)
    
    def to_string(self) -> str:
        return f"{self.x},{self.y},{self.z}"

@dataclass
class MapBounds:
    min_x: int
    max_x: int
    min_z: int
    max_z: int
    
    @property
    def center(self) -> Tuple[int, int]:
        return ((self.min_x + self.max_x) // 2,
                (self.min_z + self.max_z) // 2)

def ensure_directory_exists(filepath: Path) -> None:
    """Ensure the directory for the given file path exists."""
    filepath.parent.mkdir(parents=True, exist_ok=True)

def save_modified_map(source_path: Path, save_path: Path) -> None:
    """Save a copy of the modified map to the assets directory."""
    if source_path.exists():
        ensure_directory_exists(save_path)
        import shutil
        shutil.copy2(source_path, save_path)
        print(f"Saved modified map to: {save_path}")

def load_map(filepath: Path) -> MapData:
    """Load the map data from a JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)

def save_map(filepath: Path, map_data: MapData) -> None:
    """Save the map data to a JSON file."""
    ensure_directory_exists(filepath)
    with open(filepath, 'w') as f:
        json.dump(map_data, f, indent=2)

def get_map_bounds(blocks: Dict[str, int]) -> MapBounds:
    """Calculate the bounds of the map."""
    coords = [Coordinates.from_string(coord_str) for coord_str in blocks.keys()]
    return MapBounds(
        min_x=min(c.x for c in coords),
        max_x=max(c.x for c in coords),
        min_z=min(c.z for c in coords),
        max_z=max(c.z for c in coords)
    )

def create_flat_surface(bounds: MapBounds, block_types: BlockTypes) -> Dict[str, int]:
    """Create a flat surface with no gaps."""
    surface_blocks = {}
    for x in range(bounds.min_x, bounds.max_x + 1):
        for z in range(bounds.min_z, bounds.max_z + 1):
            coord = Coordinates(x, TARGET_HEIGHT, z)
            surface_blocks[coord.to_string()] = block_types.GRASS
    return surface_blocks

def add_center_marker(blocks: Dict[str, int], center: Tuple[int, int], block_types: BlockTypes) -> None:
    """Add marker blocks at the center of the map."""
    center_x, center_z = center
    for height in range(1, CENTER_MARKER_HEIGHT + 1):
        coord = Coordinates(center_x, TARGET_HEIGHT + height, center_z)
        blocks[coord.to_string()] = block_types.STONE_BRICKS

def process_existing_blocks(blocks: Dict[str, int], block_types: BlockTypes) -> Dict[str, int]:
    """Process existing blocks, keeping water below target height."""
    processed_blocks = {}
    for coord_str, block_id in blocks.items():
        coord = Coordinates.from_string(coord_str)
        
        # Keep water blocks only below target height
        if block_id == block_types.WATER_STILL:
            if coord.y <= TARGET_HEIGHT:
                processed_blocks[coord_str] = block_id
            continue
        
        # Keep all other blocks below target height
        if coord.y < TARGET_HEIGHT:
            processed_blocks[coord_str] = block_id
            
    return processed_blocks

def main():
    # Load the map and initialize block types
    map_data = load_map(SOURCE_MAP_PATH)
    block_types = BlockTypes(map_data['blockTypes'])
    
    # Print available block types
    block_types.print_block_types()
    
    # Calculate map bounds
    bounds = get_map_bounds(map_data['blocks'])
    center = bounds.center
    
    print(f"\nMap bounds: X({bounds.min_x} to {bounds.max_x}), Z({bounds.min_z} to {bounds.max_z})")
    print(f"Center coordinates: X({center[0]}), Z({center[1]})")
    
    # Create new block data
    new_blocks = create_flat_surface(bounds, block_types)
    
    # Process existing blocks (underground and water)
    underground_blocks = process_existing_blocks(map_data['blocks'], block_types)
    new_blocks.update(underground_blocks)
    
    # Add center marker
    add_center_marker(new_blocks, center, block_types)
    
    # Update and save the map
    map_data['blocks'] = new_blocks
    save_map(SOURCE_MAP_PATH, map_data)
    
    # Save a copy to the assets directory
    save_modified_map(SOURCE_MAP_PATH, SAVE_MAP_PATH)
    
    print(f"\nMap has been flattened at height {TARGET_HEIGHT}")
    print("Water blocks have been preserved only at or below target height")
    print("Ensured all x,z coordinates have a block at target height (no gaps)")
    print(f"Added center marker at X({center[0]}), Z({center[1]})")

if __name__ == "__main__":
    main() 