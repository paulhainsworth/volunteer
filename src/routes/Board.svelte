<script>
  let expandedMembers = new Set();

  function toggleMember(index) {
    if (expandedMembers.has(index)) {
      expandedMembers.delete(index);
    } else {
      expandedMembers.add(index);
    }
    expandedMembers = expandedMembers; // Trigger reactivity
  }

  function truncateBio(bioArray, maxLength = 200) {
    const fullText = bioArray.join(' ');
    if (fullText.length <= maxLength) {
      return { text: fullText, truncated: false };
    }
    // Find a good breaking point (end of sentence or word)
    let truncated = fullText.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastPeriod > maxLength * 0.8) {
      truncated = truncated.substring(0, lastPeriod + 1);
    } else if (lastSpace > maxLength * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }
    
    return { text: truncated, truncated: true };
  }

  // Board member data extracted from BOD.html
  const boardMembers = [
    {
      name: "Todd Brydon",
      title: "Board Member",
      memberSince: "2009",
      image: "https://images.squarespace-cdn.com/content/v1/5e5356aaa0357c1eab66f2c2/1606103328581-L8C3UR3NTST9B14R4F4J/toddBrydon.jpg",
      bio: [
        "I have been riding bikes since I can remember. A yellow Schwinn Stingray was my first cool one. On a preteen birthday, my parents transformed that Stingray into a trail-bike. Before doing so was illegal, the neighborhood kids and I would race homemade trail-bikes all in and around Tilden Park. Vying to be number one started with my brothers (first to sit on the couch, first up the stairs, first to the ice cream :-), and was encouraged by my parents who put me on local swim-teams. This craziness led to running, competing in triathlons, and eventually led to bike racing. Via cycling I've developed lifelong friendships, deeply learned you are what you do, and have rekindled the excitement felt when heading out on that yellow, homemade dirt-bike! Every ride for me is an adventure. It's a chance to hangout with pals and scream woo-hoo!",
        "I was gifted grassroots support, provided with sponsorship from companies, organizations and even people I never met while racing the bike. I got to travel, duke-it-out from town to town, and had a blast doing so. After racing, I quit the bike for a while but got back on it in 2008; shortly thereafter I joined the BBC. Here again, via cycling I have been gifted friendship, had tons of woo-hoo fun, and been welcomed-in by a sturdy grassroots group who are paying it forward supporting something they love. Helping others do this cycling thing, is part of who I have become.",
        "Additionally, I am dad, husband, brother, uncle, cousin, son, friend, worker, proud Berkeley resident, cyclist… and also a BBC/KaiVelo board-member."
      ],
      links: [
        { text: "KaiVelo", url: "https://kaivelo.org/" }
      ]
    },
    {
      name: "Justin Sowa",
      title: "Board Member",
      memberSince: "2022",
      image: null,
      bio: [
        "I joined BBC in 2022 and have since become a regular on the Saturday Marin rides and a course marshal and participant at the Berkeley Omnium. I live in Oakland with my wife Blythe.",
        "We met in New York and then came to the Bay Area and fell in love with it. In New York, I was passionate about bikes and focused on transportation and advocacy. Once in the East Bay, I traded in my fixed gear for a road bike and figured out how to ride up and down hills. I started to get serious about training and after building up the courage to ride with other people it was a short jump to racing.",
        "I now appreciate cycling at many levels. I'm committed to safety, accessibility, and diversity in the world of bikes. I feel strongly about the survival of competitive cycling. Grand Fondos, and CX are essential elements of our ecosystem. The weekend crit series and road races are fundamental to the cycling firmament, especially in California, and they are barely hanging on. The BBC—one of the largest road-centric clubs in the Bay Area—has a major opportunity, and an important obligation, to help keep NorCal road racing alive, while also maintaining a presence in other forms of competitive and non-competitive cycling and advocacy.",
        "I've met so many amazing people in the Bay Area riding community and look forward to giving back to that community in any way I can. And I'm sure I can be an asset to the club and the community."
      ]
    },
    {
      name: "Jason Tang",
      title: "Board Member",
      memberSince: "2021",
      image: "https://images.squarespace-cdn.com/content/v1/5e5356aaa0357c1eab66f2c2/1614755770201-Z1NWMKTYTOL8E2ODRMVQ/jasonTang.jpg",
      bio: [
        "My journey into the cycling world began when I joined my high school mountain bike team with a few friends. I quickly fell in love with the escape from daily life and the outlet for pushing my physical and mental limits that cycling provides. After high school, I attended UC Berkeley and joined the Cal cycling team, which introduced me to the world of road racing. For my four years at Cal, I raced both mountain and road bikes in the Western Collegiate Cycling Conference (WCCC). In my third and fourth years, I served as an officer of the team and helped organize several of Cal's mountain and road races. I also began to meet people in the BBC (mostly through very long road rides as for some reason it was difficult to convince my college teammates to get up early and go on 5+ hour training rides) and have strived to create a stronger connection between collegiate riders and the broader cycling community.",
        "Since graduating in 2019, I have been working for the San Francisco arm of an airport consulting company, but cycling remains a large part of my life away from work. My goals as a BOD member include continuing to build the relationship with the younger cycling community, learning how to make our club more appealing and accessible to a wide range of demographics, and using some of my racing experience to help BBC continue to put on great races and to help competitive-minded members find and enjoy the regional racing scene."
      ]
    },
    {
      name: "Maya Wolf",
      title: "Co-President",
      memberSince: "2021",
      image: "https://images.squarespace-cdn.com/content/v1/5e5356aaa0357c1eab66f2c2/1616652643687-M4SNFB2PAXROQTHPVOBH/mayaWolf.jpg",
      bio: [
        "As a BBC Board Member, my priority is helping BBC to make cycling a sport where riders of all genders, races, and economic means feel welcomed and resourced.",
        "I grew up watching my dad bike commute and also train each year for the Tour of the Unknown Coast race in Humboldt County. I began riding myself when I moved to the cycling mecca of Portland, OR for college. I started with bike commuting, then got into bike touring, and more recently began racing. Biking for me is a way to take care of my mental health, spend quality time with others, explore my competitive side, challenge myself, and delight in this beautiful place I get to call home. You'll most often see me on the road in my Gulf Oil-colored Specialized Amira. When not out riding, I work to advance California's clean energy goals.",
        "I see this club as home for existing high performance cyclists as well as those newly-avid cyclists out there who want to take their riding to the next level. If you're thinking about becoming a member but not sure if this Club is \"right\" for you, please reach out to me by emailing berkeleybike1979@gmail.com or finding me on Strava so we can talk!"
      ],
      links: [
        { text: "Strava", url: "https://www.strava.com/athletes/9067175" }
      ]
    },
    {
      name: "Todd Edmister",
      title: "Board Member",
      memberSince: "2023",
      image: null,
      bio: [
        "I am very excited to see the BBC get a juniors program off the ground, as led by Nate English and Todd B. Establishing and furthering this new juniors program will be my top priority.",
        "It's challenging for kids to get into road and track riding. There are bureaucratic, financial, logistical, and safety issues that are holding them back. Kids and parents need a smoother onramp to road and track riding in our area. My 16-year-old son has been racing all manner of bikes for the past couple years. That has given me a chance to see what's working and what's not in the local scene, as well as make contacts with those currently in the space. I believe the BBC has great resources within its membership to help clear those obstacles. And so, after a couple years observing, I'm ready to do more.",
        "There are lot of other facets to the club and so too board membership, and I'll take those on as well. But it's juniors racing and establishing durable institutions to build future generations of racers which will be my focus.",
        "Some biographical stuff - I've been riding for four decades. I started with touring as a teen, then layered on racing, which I kept up into my early 30s. I've been a USAC Cat 2 since 1990. I raced for UC Berkeley as an undergrad and while in law school and was Cal Cycling team President in 1990-91. With the arrival of my kids, I started riding recreationally, but just recently started racing again in the Masters 50+. Figured I may as well, since I'm already at courses and the track with my kid!"
      ],
      links: [
        { text: "juniors program", url: "https://www.berkeleybikeclub.org/juniors-team" },
        { text: "Nate English", url: "https://www.englishendurance.com" }
      ]
    },
    {
      name: "Paul Hainsworth",
      title: "Co-President",
      memberSince: "2014",
      image: null,
      bio: [
        "Paul has served on the Board of Directors in the past and is returning for another term.",
        "I've been a BBC member since 2014. BBC has given me so much for which to be grateful: skills, fitness, friends, purpose. Along the way, I have tried to give back to the club. Whatever contributions I have made to the BBC, I've received back 10 times over. From 2015 to 2022, I was the race promoter/director or co-promoter of the Berkeley Hills Road Race. In 2017, some of us collaborated to convert the event into a fundraiser for Berkeley High School's NICA MTB Team and four other East Bay NICA teams. We've now raised over $150K for the teams. In 2021, a group of us worked to create the Berkeley Omnium, a two-day fundraiser event including the BHRR and the Berkeley Streets Criterium, a collab with UC Berkeley's Cal Cycling. With over 700 racers in 2022 and 2023, BHRR itself was the number one best attended bicycle race in our district!",
        "I was a BBC board member for three years from 2017 to 2019. I wish to rejoin the board to further contribute to the club's mission. In particular, I believe that Berkeley Omnium, which has grown in size, budget, and stature, will benefit from active BBC board stewardship. The Omnium delivers on two key pillars of our mission: local amateur bike racing and paying it forward by raising funds for high school racers. Further, I am hopeful that my background as a founder, CEO and product manager can be of help to the Board with focusing our priorities and driving outcomes that best benefit our club members and the community.",
        "I am proud to be part of a group which gets things done together. I will give it my best to ensure that all club members are heard, build stronger connections within this incredible community of riders and racers, and grow engagement on and off the road with our diverse membership."
      ]
    },
    {
      name: "Beth Zacherle",
      title: "Board Member",
      memberSince: "2023",
      image: "https://images.squarespace-cdn.com/content/v1/5e5356aaa0357c1eab66f2c2/817ef9ca-0683-46d6-af64-93880e32ce4a/P5200004.jpg",
      bio: [
        "Hi there! I'm Beth and I'd be honored to be serve on the BBC Board of Directors. I fell in love with cycling after moving to the Bay Area in spring of 2019. The WTFN folks invited me to join the group ride and since then, this community, and riding in general, has given me stability through my move, COVID, and some significant life changes. I truly could not have survived it all without cycling and the BBC.",
        "I ride a lot, though I still consider myself a novice. I have completed a few centuries and my first AIDS LifeCycle this past June. But, despite participating in some amazing events, my favorite rides are those with the BBC--they always leave my cup full and my tank empty. I'm running for a position on the Board to build our community. It's that simple. I believe in our mission and our ability to truly impact a range of cyclists--from juniors to newcomers to veterans. The BBC has helped make California my new home, and I hope to make that true for others in the Bay Area.",
        "In the last few years, I have contributed by organizing some WTFN rides (aka \"The Bucket List\") and being an unofficial ride leader on occasion. I also facilitated the launch of BBC Community Slack. If elected, my other priorities would be to:",
        "• Co-develop practices which ensure all members feel welcome and safe on rides",
        "• Strengthen the WTFN mini-community and help it to be part of the whole",
        "• Support ongoing initiatives and bring BBC culture to everything we do",
        "• And simply get stuff done!",
        "Our community has a rich history and a strong vision. My hope is to carry our legacy into the future while meeting the needs of today. I appreciate your consideration and involvement in the election process!"
      ],
      links: [
        { text: "AIDS LifeCycle", url: "https://www.aidslifecycle.org" },
        { text: "WTFN rides", url: "https://www.berkeleybikeclub.org/friday-womyn-trans-femme-ride" }
      ]
    },
    {
      name: "Christopher Lee",
      title: "Board Member",
      memberSince: "2023",
      image: null,
      bio: [
        "Hello fellow BBC members. I've been an avid cyclist since the mid-2000s when I took up road riding and discovered two of my greatest pleasures—riding a road bike and my bike family. During my first decade as a cyclist, I've enjoyed the company of many warm and welcoming bike communities in the East Bay, from my first 'Bike Dad' Steve Shaw, to riding with more established clubs such as GPC, East Bay Velo, and the SF Randonneurs. In the fall of 2015, a fortuitous introduction happened. A small group of BBC members were revitalizing their dormant race program and put me under their spell to test my mettle as a neophyte Cat 5 Masters Racer. I had a fantastic time, despite my official results, and my connection to the BBC community was galvanized. Since then, I've considered BBC the center of my bike community, and I've shared a host of experiences with the club including several seasons racing, innumerable group rides, and more than a few extraordinary adventures. (Anyone remember the 2016 Coast Ride? Rained ALL three days!)",
        "Beyond my love of all things BBC, I also maintain membership and affiliations with all the bike clubs I've joined over the years. I have recently inherited leadership duties of the GPC Tuesday Ride and I intend to continue the extra-club affiliation as a ride leader for their club.",
        "Since I joined in 2015, I've seen many fantastic people working hard to build our club up in both membership and mission. Those people and their hard work developing the club have been an inspiration to me. As I continue to enjoy my wonderful bike family, I've felt the call to step forward and serve this community. As a member of the Board, I intend to further the club's mission regarding diversity, inclusion and understanding. I intend to build better connections among club members, and across other clubs as well, by participating in both big and small ways—coordinating large events such as the Berkeley Omnium or helping with the weekly rides such as the GPC Tuesday."
      ]
    },
    {
      name: "Hussein Jamsheed",
      title: "Board Member",
      memberSince: null,
      image: null,
      bio: [
        "I'm a recent joiner to the club. This December will mark my second year. I've enjoyed being part of the BBC. The club members I've met are welcoming and I find our group rides are well organized.",
        "My main motivation for joining the club was to improve as a cyclist. From my perspective the group rides provided me with an opportunity to pursue my goal. The rides allow our members to explore different routes and the ability to learn from more experienced riders."
      ]
    },
    {
      name: "Deepak",
      title: "Treasurer",
      memberSince: "2022",
      image: null,
      bio: []
    }
  ];

  // Format bio text, handling links and bullet points
  function formatBio(text) {
    if (!text) return '';
    
    // Split by paragraphs (double spaces or newlines) but preserve structure
    // For now, just return as a paragraph since we're showing truncated version
    return `<p>${text}</p>`;
  }
</script>

<div class="board-page">
  <div class="header">
    <h1>Board of Directors</h1>
  </div>

  <div class="board-members">
    {#each boardMembers as member}
      <article class="board-member">
        {#if member.image}
          <div class="member-image">
            <img src={member.image} alt={member.name} loading="lazy" />
          </div>
        {/if}
        
        <div class="member-info">
          <div class="member-header">
            <h2>{member.name}</h2>
            <div class="member-title">{member.title}</div>
            {#if member.memberSince}
              <div class="member-since">Member Since {member.memberSince}</div>
            {/if}
          </div>

          <div class="member-bio">
            {#if member.bio.length > 0}
              {@const fullBioText = member.bio.join(' ')}
              {@const isExpanded = expandedMembers.has(boardMembers.indexOf(member))}
              {@const shouldTruncate = fullBioText.length > 200 && !isExpanded}
              {@const displayText = shouldTruncate 
                ? truncateBio(member.bio).text
                : fullBioText}
              
              <div class="bio-content">
                {#if isExpanded}
                  {#each member.bio as paragraph}
                    <p>{paragraph}</p>
                  {/each}
                  {#if fullBioText.length > 200}
                    <div class="expand-btn-container">
                      <button 
                        class="expand-btn" 
                        on:click={() => toggleMember(boardMembers.indexOf(member))}
                        aria-label="Collapse bio"
                      >
                        −
                      </button>
                    </div>
                  {/if}
                {:else}
                  <span class="bio-preview">
                    {displayText}
                    {#if fullBioText.length > 200}
                      <button 
                        class="expand-btn" 
                        on:click={() => toggleMember(boardMembers.indexOf(member))}
                        aria-label="Expand bio"
                      >
                        +
                      </button>
                    {/if}
                  </span>
                {/if}
              </div>
            {/if}

            {#if member.links}
              <div class="member-links">
                {#each member.links as link}
                  <a href={link.url} target="_blank" rel="noopener noreferrer">{link.text}</a>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  .board-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .header h1 {
    font-size: 2.5rem;
    color: #1a1a1a;
    margin-bottom: 1rem;
  }

  .board-members {
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .board-member {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    padding: 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .member-image {
    width: 100%;
    max-width: 300px;
  }

  .member-image img {
    width: 100%;
    height: auto;
    border-radius: 8px;
    object-fit: cover;
  }

  .member-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .member-header h2 {
    font-size: 1.75rem;
    color: #1a1a1a;
    margin-bottom: 0.5rem;
  }

  .member-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #007bff;
    margin-bottom: 0.25rem;
  }

  .member-since {
    font-size: 0.95rem;
    color: #6c757d;
  }

  .member-bio {
    line-height: 1.6;
    color: #495057;
  }

  .bio-content {
    position: relative;
  }

  .member-bio p {
    margin-bottom: 1rem;
  }

  .bio-preview {
    display: inline;
  }

  .expand-btn-container {
    display: inline-block;
    margin-top: 0.5rem;
  }

  .member-bio .bio-bullet {
    margin-bottom: 0.5rem;
    padding-left: 1rem;
  }

  .member-bio a {
    color: #007bff;
    text-decoration: underline;
  }

  .member-bio a:hover {
    color: #0056b3;
  }

  .expand-btn {
    background: #007bff;
    color: white;
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    font-size: 1.5rem;
    font-weight: bold;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.5rem;
    transition: background-color 0.2s, transform 0.2s;
    vertical-align: middle;
    line-height: 1;
    padding: 0;
    flex-shrink: 0;
  }

  .expand-btn:hover {
    background: #0056b3;
    transform: scale(1.1);
  }

  .expand-btn:active {
    transform: scale(0.95);
  }

  .member-links {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .member-links a {
    color: #007bff;
    text-decoration: underline;
  }

  .member-links a:hover {
    color: #0056b3;
  }

  @media (max-width: 768px) {
    .board-member {
      grid-template-columns: 1fr;
    }

    .member-image {
      max-width: 100%;
      margin: 0 auto;
    }

    .header h1 {
      font-size: 2rem;
    }
  }
</style>

