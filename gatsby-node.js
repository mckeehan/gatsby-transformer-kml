//const geojson = require('togeojson')
const geojson = require('@tmcw/togeojson');

const DOMParser = require('xmldom').DOMParser;
const crypto = require('crypto')
const path = require("path")
const { createFilePath } = require("gatsby-source-filesystem")

const parseDocument = content => new DOMParser().parseFromString(content);

const parseKML = markup => geojson.kml(parseDocument(markup))
const parseGPX = markup => geojson.gpx(parseDocument(markup))

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  const typeDefs = `
    type GPXfile implements Node @dontInfer {
        tracks: [Track]
        waypoints: [Waypoint]
        center: [Float]
        name: String
        absolutePath: String
        relativePath: String
        mydir: String
        myname: String
        slug: String
        properties: GPXMetadataProperties
    }
    type GPXMetadataProperties {
        name: String
        desc: String
        keywords: String
        time: Date
    }
    type Waypoint {
        type: String
        properties: WaypointProperties
        geometry: WaypointGeometry
    }
    type WaypointProperties {
        name: String
        time: Date
        sym: String
        desc: String
    }
    type WaypointGeometry {
        type: String
        coordinates: [Float]
    }
    type Track {
        center: [Float]
        geometry: GPXGeometry
        type: String
        properties: GPXProperties
    }
    type GPXGeometry {
        coordinates: [[Float]]
        type: String
    }
    type GPXProperties {
        name: String
        time: Date
        _gpxType: String
        coordinateProperties: CoordinateProperties
        desc: String
    }
    type CoordinateProperties {
      times: [String]
    }
  `
  createTypes(typeDefs)
}

exports.onCreateNode = async ({ 
  node,
  actions,
  loadNodeContent,
  createNodeId,
  createContentDigest
}) => {

  //parse GPX data
  if (node.internal.mediaType === "application/gpx+xml") {
    const content = await loadNodeContent(node)

    const relativePath = createFilePath({ node, loadNodeContent, trailingSlash: false }).replace(/[|&;$%@"<>()+,]/g, "").replaceAll(/ /g, '-').toLowerCase()
    const { dir = ``, name } = path.parse(relativePath)

    const data = parseGPX(content)

    if (data.type && data.type === "FeatureCollection") {
      if (data.features && data.features.length > 0 ) {
        const { createNode, createNodeField } = actions
        const waypoints = data.features.filter( f => ( f && f.geometry && f.geometry.type === "Point" )  )
        const tracks = data.features.filter( f => ( f && f.geometry && f.geometry.type === "LineString" && f.geometry.coordinates && f.geometry.coordinates.length > 0 )  )
        tracks.forEach(feature => {
          if (feature.type && feature.type === 'Feature' && feature.properties && feature.properties.name) {
            var minX = minY = maxX = maxY = undefined;
            feature.geometry.coordinates.forEach( cord => {
              var x = cord[1];
              var y = cord[0];
              minX = minX === undefined || x < minX ? x : minX;
              minY = minY === undefined || x < minY ? y : minY;
              maxX = maxX === undefined || x > maxX ? x : maxX;
              maxY = maxY === undefined || x > maxY ? y : maxY;
            })
            if( minX && minY && maxX && maxY ) {
              centerX = ( minX + maxX) / 2;
              centerY = ( minY + maxY) / 2;
            }
            feature.center = [ centerX, centerY ];
          }
        })

        //console.log(data.properties);

        const nodeId = createNodeId(`gpx-${relativePath}`)
        const nodeContent = JSON.stringify(tracks)
        const nodeContentDigest = crypto
          .createHash('md5')
          .update(nodeContent)
          .digest('hex')

        const nodeData = Object.assign({}, {
          id: nodeId,
          parent: null,
          children: [],
          internal: {
            type: `GPXfile`,
            content: nodeContent,
            contentDigest: nodeContentDigest,
          },
          tracks: tracks,
          waypoints: waypoints,
          name: data.name || node.name,
          absolutePath: node.absolutePath,
          relativePath: node.relativePath,
          mydir: dir,
          myname: name,
          slug: relativePath,
          properties: data.properties
        })

        createNode(nodeData, createNodeId)
      }
    }
  }

  //parse KML data
  if (node.internal.mediaType === "application/vnd.google-earth.kml+xml") {
    const content = await loadNodeContent(node)

    const data = parseKML(content)

    if (data.type && data.type === "FeatureCollection") {
      if (data.features) {
        const { createNode } = actions
        data.features.forEach(feature => {
          if (feature.type && feature.type === 'Feature' && feature.properties && feature.properties.name) {
            const nodeId = createNodeId(`feature-${feature.properties.name}`)
            const nodeContent = JSON.stringify(feature)
            const nodeContentDigest = crypto
              .createHash('md5')
              .update(nodeContent)
              .digest('hex')

            const nodeData = Object.assign({}, feature, {
              id: nodeId,
              parent: null,
              children: [],
              internal: {
                type: `KML${feature.geometry.type}`,
                content: nodeContent,
                contentDigest: nodeContentDigest,
              },
            })

            createNode(nodeData, createNodeId)
          }
        })
      }
    }

  }

}
