const fs = require("fs");

try{
    const data = fs.readFileSync("README.md", "utf-8");
    const sections = data.split("## ");
    const sectionMap = {};

    const intro = sections[0].trim();
    sections.slice(1).forEach(section => {
        const lines = section.split("\n");
        const title = lines[0].trim().toLowerCase();
        const content = lines.slice(1).join("\n").trim(); 
                                    
        sectionMap[title] = content;
    });

    const requiredSections = [
    "description",
    "installation",
    "usage",
    "dependencies",
    "folder structure",
    "license",
    "built by"
    ];

    requiredSections.forEach(section => {
        if(!(section in sectionMap))
            {sectionMap[section] = "TODO: Add content here";}    
    });

    function formatTitle(title) {
        return title
            .split(" ")
            .map(word => word[0].toUpperCase() + word.slice(1))
            .join(" ");
    }

    let newReadme = intro ?  intro + "\n\n" : "";
    requiredSections.forEach(section => {
        newReadme += `## ${formatTitle(section)}\n${sectionMap[section]}\n\n`;
    });

    Object.keys(sectionMap).forEach(section => {
        if (!requiredSections.includes(section)) {
            newReadme += `## ${formatTitle(section)}\n\n ${sectionMap[section]}\n\n`;
        }
    });

    if(data !== newReadme){
        fs.writeFileSync("README.md", newReadme, "utf-8");
        console.log("README.md has been updated!");
    }else{
        console.log("README.md is already up to date.");
    }

} catch(err){
    console.error("Error reading the file:", err);
}